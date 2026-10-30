import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { GoogleService } from '../integrations/google.service';
import { CatalogItem, SourceInput, normalizeRows, itemText, searchTerms } from './data-contracts';
import { OutContent } from '../flows/engine/types';
import { isGeneralCompanyQuestion } from './catalog-routing';
@Injectable()
export class DataSourcesService implements OnModuleInit, OnModuleDestroy {
  constructor(
    private db: DatabaseService,
    private google: GoogleService,
  ) {}
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  onModuleInit() {
    if (process.env.NODE_ENV !== 'test') {
      this.timer = setInterval(() => void this.tick().catch(() => undefined), 60000);
      this.timer.unref();
    }
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  list(tenant: string) {
    return this.db.withTenant(
      tenant,
      async (c) => (await c.query('SELECT * FROM catalog_sources ORDER BY created_at DESC')).rows,
    );
  }
  async source(tenant: string, id: string) {
    return this.db.withTenant(tenant, async (c) => {
      const s = (await c.query('SELECT * FROM catalog_sources WHERE id=$1', [id])).rows[0];
      if (!s) throw new NotFoundException('Data source unavailable');
      return s;
    });
  }
  async save(tenant: string, v: SourceInput, id?: string) {
    return this.db.withTenant(tenant, async (c) => {
      if (
        v.connectionId &&
        !(
          await c.query(
            "SELECT 1 FROM integration_connections WHERE id=$1 AND provider='google' AND enabled",
            [v.connectionId],
          )
        ).rowCount
      )
        throw new BadRequestException('Choose an authorized Google account');
      const params = [
        tenant,
        v.name,
        v.kind,
        v.connectionId ?? null,
        v.spreadsheetId ?? null,
        v.range ?? null,
        JSON.stringify(v.mapping),
        v.autoSync,
        v.aiEnabled,
      ];
      if (id) {
        const r = await c.query(
          'UPDATE catalog_sources SET name=$2,kind=$3,connection_id=$4,spreadsheet_id=$5,sheet_range=$6,mapping=$7,auto_sync=$8,ai_enabled=$9,revision=revision+1 WHERE tenant_id=$1 AND id=$10 RETURNING *',
          [...params, id],
        );
        if (!r.rowCount) throw new NotFoundException('Data source unavailable');
        return r.rows[0];
      }
      return (
        await c.query(
          'INSERT INTO catalog_sources(tenant_id,name,kind,connection_id,spreadsheet_id,sheet_range,mapping,auto_sync,ai_enabled) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
          params,
        )
      ).rows[0];
    });
  }
  async readGoogle(tenant: string, id: string) {
    const s = await this.source(tenant, id);
    if (s.kind !== 'google')
      throw new BadRequestException('Upload a new file to update this source');
    const r = await this.google.execute(tenant, s.connection_id, {
      operation: 'sheet_read',
      spreadsheetId: s.spreadsheet_id,
      range: s.sheet_range,
    });
    const data = ('data' in r ? r.data : {}) as { values?: unknown[][] };
    return (data.values ?? []).map((row) => row.map((v) => String(v ?? '')));
  }
  async failure(tenant: string, id: string) {
    await this.db.withTenant(tenant, async (c) => {
      const updated = await c.query(
        "UPDATE catalog_sources SET last_attempt_at=now(),last_error='Update failed. Last successful data retained. Check authorization, columns and file contents.',next_sync_at=now()+interval '15 minutes' WHERE id=$1",
        [id],
      );
      if (!updated.rowCount) return;
      await c.query(
        "INSERT INTO catalog_sync_runs(tenant_id,source_id,status,error) VALUES($1,$2,'failed','Update failed; last successful data retained')",
        [tenant, id],
      );
    });
  }
  async preview(tenant: string, id: string, rows?: string[][]) {
    try {
      const s = await this.source(tenant, id);
      const normalized = normalizeRows(rows ?? (await this.readGoogle(tenant, id)), s.mapping);
      if (normalized.errors.length) {
        await this.failure(tenant, id);
        return {
          valid: false,
          errors: normalized.errors,
          items: normalized.items.slice(0, 20),
          total: normalized.items.length,
        };
      }
      if (!normalized.items.length) throw new BadRequestException('Empty updates are not applied');
      return this.db.withTenant(tenant, async (c) => {
        await c.query(
          "DELETE FROM catalog_sync_previews WHERE source_id=$1 AND created_at<now()-interval '1 hour'",
          [id],
        );
        const token = (
          await c.query(
            'INSERT INTO catalog_sync_previews(tenant_id,source_id,revision,items) VALUES($1,$2,$3,$4) RETURNING id',
            [tenant, id, s.revision, JSON.stringify(normalized.items)],
          )
        ).rows[0].id;
        const missing = (
          await c.query(
            'SELECT count(*)::int AS n FROM catalog_products WHERE source_id=$1 AND NOT archived AND NOT(external_key=ANY($2::text[]))',
            [id, normalized.items.map((i) => i.key)],
          )
        ).rows[0].n;
        return {
          valid: true,
          previewId: token,
          items: normalized.items.slice(0, 20),
          total: normalized.items.length,
          missing,
          errors: [],
        };
      });
    } catch (e) {
      await this.failure(tenant, id);
      throw new BadRequestException((e as Error).message);
    }
  }
  async apply(tenant: string, id: string, previewId: string, archiveMissing = false) {
    return this.db.withTenant(tenant, async (c) => {
      const s = (await c.query('SELECT * FROM catalog_sources WHERE id=$1 FOR UPDATE', [id]))
        .rows[0];
      if (!s) throw new NotFoundException('Data source unavailable');
      const p = (
        await c.query(
          "SELECT * FROM catalog_sync_previews WHERE id=$1 AND source_id=$2 AND created_at>now()-interval '1 hour' FOR UPDATE",
          [previewId, id],
        )
      ).rows[0];
      if (!p || p.revision !== s.revision)
        throw new ConflictException('Preview expired or source changed; preview again');
      const items = p.items as CatalogItem[];
      if (!items.length) throw new BadRequestException('Empty update rejected');
      for (const item of items) {
        const productId = randomUUID();
        await c.query(
          `INSERT INTO catalog_products(id,tenant_id,sku,name,description,price_cents,currency,image_url,link_url,archived,source_id,external_key,category_path,sort_order,dynamic_fields,category_sort)
 VALUES($1,$2,$3,$4,$5,0,'EGP',$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT(tenant_id,source_id,external_key) WHERE source_id IS NOT NULL DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,image_url=EXCLUDED.image_url,link_url=EXCLUDED.link_url,archived=EXCLUDED.archived,category_path=EXCLUDED.category_path,sort_order=EXCLUDED.sort_order,dynamic_fields=EXCLUDED.dynamic_fields,category_sort=EXCLUDED.category_sort,updated_at=now()`,
          [
            productId,
            tenant,
            'source:' + productId,
            item.name,
            item.description,
            item.image,
            item.link,
            !item.visible,
            id,
            item.key,
            item.category,
            item.sort,
            JSON.stringify(item.fields),
            item.categorySort ?? 0,
          ],
        );
      }
      if (archiveMissing)
        await c.query(
          'UPDATE catalog_products SET archived=true,updated_at=now() WHERE source_id=$1 AND NOT(external_key=ANY($2::text[]))',
          [id, items.map((i) => i.key)],
        );
      await c.query(
        "UPDATE catalog_sources SET revision=revision+1,last_attempt_at=now(),last_success_at=now(),last_error=NULL,next_sync_at=now()+interval '15 minutes' WHERE id=$1",
        [id],
      );
      await c.query(
        "INSERT INTO catalog_sync_runs(tenant_id,source_id,status,item_count) VALUES($1,$2,'success',$3)",
        [tenant, id, items.length],
      );
      await c.query('DELETE FROM catalog_sync_previews WHERE source_id=$1', [id]);
      return { updated: items.length, archivedMissing: archiveMissing };
    });
  }
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const due = (await this.db.query('SELECT * FROM catalog_sources_due()')).rows;
      for (const s of due) {
        await this.db.withTenant(s.tenant_id, async (c) => {
          const claimed = (
            await c.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,95)) AS locked', [
              s.id,
            ])
          ).rows[0].locked;
          if (!claimed) return;
          const current = await this.source(s.tenant_id, s.id);
          if (!current.auto_sync || new Date(current.next_sync_at) > new Date()) return;
          try {
            const p = await this.preview(s.tenant_id, s.id);
            if (!p.valid || !('previewId' in p) || !p.previewId) return;
            await this.apply(s.tenant_id, s.id, p.previewId, false);
          } catch {
            await this.failure(s.tenant_id, s.id);
          }
        });
      }
    } finally {
      this.running = false;
    }
  }
  runs(tenant: string, id: string) {
    return this.db.withTenant(
      tenant,
      async (c) =>
        (
          await c.query(
            'SELECT status,item_count,error,created_at FROM catalog_sync_runs WHERE source_id=$1 ORDER BY created_at DESC LIMIT 30',
            [id],
          )
        ).rows,
    );
  }
  async categories(tenant: string, id: string) {
    await this.source(tenant, id);
    return this.db.withTenant(
      tenant,
      async (c) =>
        (
          await c.query(
            'SELECT category_path AS name,count(*)::int AS count FROM catalog_products WHERE source_id=$1 AND NOT archived GROUP BY category_path ORDER BY min(category_sort),category_path',
            [id],
          )
        ).rows,
    );
  }
  async items(tenant: string, id: string, category = '', query = '', page = 0, pageSize = 8) {
    const source = await this.source(tenant, id);
    const terms = searchTerms(query);
    return this.db.withTenant(tenant, async (c) => {
      const searchable =
        "lower(translate(name||' '||description||' '||category_path||' '||dynamic_fields::text,'أإآىة','ااايه'))";
      const where = `source_id=$1 AND NOT archived AND ($2='' OR category_path=$2 OR starts_with(category_path,$2||'/')) AND NOT EXISTS(SELECT 1 FROM unnest($3::text[]) AS term WHERE CASE WHEN term ~ '^[a-z0-9]+$' THEN ${searchable} !~ ('\\m'||term||'\\M') ELSE ${searchable} NOT LIKE '%'||replace(replace(replace(term,'\\','\\\\'),'%','\\%'),'_','\\_')||'%' END)`;
      const values = [id, category, terms];
      const total = (
        await c.query(`SELECT count(*)::int AS n FROM catalog_products WHERE ${where}`, values)
      ).rows[0].n;
      const rows = (
        await c.query(
          `SELECT id,name,description,source_id,category_path,dynamic_fields,image_url,link_url FROM catalog_products WHERE ${where} ORDER BY sort_order,name,id LIMIT $5 OFFSET $4`,
          [...values, Math.min(page, 1429) * pageSize, pageSize],
        )
      ).rows;
      return {
        items: rows,
        total,
        page,
        stale: !!source.last_error,
        lastSuccessAt: source.last_success_at,
      };
    });
  }
  async item(tenant: string, source: string, id: string, fields?: string[]) {
    const currentSource = await this.source(tenant, source);
    return this.db.withTenant(tenant, async (c) => {
      const p = (
        await c.query(
          'SELECT id,name,description,category_path,source_id,dynamic_fields,image_url,link_url FROM catalog_products WHERE id=$1 AND source_id=$2 AND NOT archived',
          [id, source],
        )
      ).rows[0];
      if (!p)
        throw new NotFoundException(
          'This item is no longer available. Please browse the current catalog.',
        );
      return {
        selection: { id: p.id, name: p.name, category: p.category_path, source: p.source_id },
        ...(p.image_url
          ? { attachment: { media: { kind: 'image' as const, url: p.image_url } } as OutContent }
          : {}),
        content: {
          text:
            (currentSource.last_error
              ? 'تعذر التحديث؛ آخر بيانات مؤكدة: ' +
                String(currentSource.last_success_at) +
                ' / Update failed; last successful data follows.\n'
              : '') + itemText(p, fields),

          ...(p.link_url ? { cta: { text: 'View / عرض', url: p.link_url } } : {}),
        } as OutContent,
      };
    });
  }
  async content(
    tenant: string,
    req: {
      sourceId: string;
      category?: string;
      categoryKey?: string;
      query?: string;
      page?: number;
      fields?: string[];
      text?: string;
    },
  ) {
    let category = req.category || '';
    let back = false;
    if (!category && !req.query) {
      const categories = (await this.categories(tenant, req.sourceId)).filter((c) => c.name);
      const key = (name: string) => createHash('sha256').update(name).digest('hex').slice(0, 24);
      const selected = categories.find((c) => key(c.name) === req.categoryKey);
      if (selected) {
        category = selected.name;
        back = true;
      } else if (categories.length) {
        const page = req.page ?? 0,
          rows = categories.slice(page * 8, page * 8 + 8).map((c) => ({
            id: 'dynamic:category:' + key(c.name),
            title: String(c.name).slice(0, 24),
            description: String(c.count) + ' items / عنصر',
          }));
        if (page > 0)
          rows.push({ id: 'dynamic:prev', title: 'السابق / Previous', description: '' });
        if ((page + 1) * 8 < categories.length)
          rows.push({ id: 'dynamic:next', title: 'التالي / Next', description: '' });
        return {
          text: (req.text || 'اختر القسم / Choose a category').slice(0, 1024),
          list: {
            buttonText: 'الأقسام / Sections',
            sections: [{ title: 'الأقسام / Sections', rows }],
          },
        } as OutContent;
      }
    }
    const size = back ? 7 : 8;
    const r = await this.items(tenant, req.sourceId, category, req.query, req.page, size);
    const rows = r.items.map((p) => ({
      id: 'dynamic:' + p.id,
      title: p.name.slice(0, 24),
      description: (p.dynamic_fields as { label: string; value: string }[])
        .filter((f) => !req.fields?.length || req.fields.includes(f.label))
        .map((f) => `${f.label}: ${f.value}`)
        .join(' • ')
        .slice(0, 72),
    }));
    if (r.page > 0) rows.push({ id: 'dynamic:prev', title: 'السابق / Previous', description: '' });
    if ((r.page + 1) * size < r.total)
      rows.push({ id: 'dynamic:next', title: 'التالي / Next', description: '' });
    if (back) rows.push({ id: 'dynamic:categories', title: 'الأقسام / Sections', description: '' });
    return {
      text: (
        (r.stale
          ? 'تعذر التحديث؛ نعرض آخر نسخة سليمة. / Update failed; showing last successful data.\n'
          : '') + (req.text || 'اختر من الكتالوج / Choose an item')
      ).slice(0, 1024),
      ...(rows.length
        ? {
            list: {
              buttonText: 'عرض / Browse',
              sections: [{ title: (category || 'Catalog').slice(0, 24), rows }],
            },
          }
        : {}),
    } as OutContent;
  }
  /** Catalog answers are rendered from current rows, never generated from spreadsheet instructions or stale knowledge. */
  async answer(
    tenant: string,
    question: string,
    selected?: string,
  ): Promise<{
    text: string;
    handoff: boolean;
    failed: boolean;
    sources: { title: string }[];
  } | null> {
    const sources = (await this.list(tenant)).filter((s) => s.ai_enabled);
    if (!sources.length) return null;
    if (isGeneralCompanyQuestion(question)) return null;
    // Follow-up questions must resolve the selected current row even beyond the first search page.
    if (selected && /سعر|بكام|كام|price|cost|how much|مقاس|لون/i.test(question)) {
      const wanted = searchTerms(question);
      for (const source of sources.filter((s) => s.last_success_at)) {
        try {
          const item = await this.item(tenant, source.id, selected),
            tokens = (item.content.text ?? '')
              .toLowerCase()
              .normalize('NFKC')
              .replace(/[أإآ]/g, 'ا')
              .replace(/ى/g, 'ي')
              .replace(/ة/g, 'ه')
              .split(/[^\p{L}\p{N}]+/u);
          if (
            wanted.every((term) =>
              tokens.some((token) =>
                /^[a-z0-9]+$/.test(term) ? token === term : token.includes(term),
              ),
            )
          ) {
            return {
              text:
                (item.content.text ?? '') +
                '\nالمعلومات غير المذكورة تحتاج تأكيد الموظف. / Unlisted information requires staff confirmation.',
              handoff: false,
              failed: false,
              sources: [{ title: source.name }],
            };
          }
        } catch {
          /* Hidden, foreign or unavailable rows cannot supply a follow-up answer. */
        }
      }
    }
    const all = [];
    for (const s of sources.filter((s) => s.last_success_at)) {
      const r = await this.items(tenant, s.id, '', question, 0);
      for (const p of r.items) all.push({ ...p, sourceName: s.name, stale: r.stale });
    }
    if (selected) {
      const chosen = all.find((p) => p.id === selected);
      if (chosen) all.splice(0, all.length, chosen);
    }
    if (!all.length)
      return {
        text: 'المعلومة غير موجودة في الكتالوج الحالي. يمكنني تحويلك لموظف. / This information is not in the current catalog. I can connect you with staff.',
        handoff: true,
        failed: false,
        sources: [],
      };
    const text = all
      .slice(0, 6)
      .map((p) => itemText(p))
      .join('\n\n');
    return {
      text:
        (all.some((p) => p.stale)
          ? 'تعذر تحديث المصدر؛ هذه آخر نسخة سليمة. / Source update failed; these are last successful values.\n'
          : '') +
        text +
        '\n\nالمعلومات غير المذكورة تحتاج تأكيد الموظف. / Unlisted information requires staff confirmation.',
      handoff: false,
      failed: false,
      sources: [...new Set(all.map((p) => p.sourceName))].map((title) => ({ title })),
    };
  }
}
