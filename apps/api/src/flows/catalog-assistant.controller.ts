import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Roles } from '../auth/decorators';
import { parse } from '../common/zod';
import { AuthedRequest } from '../common/types';
import { DatabaseService } from '../database/database.service';
import { checkoutSchema } from '../commerce/checkout';
import { flowTransferSchema } from './flow-schemas';
import type { FlowNode } from './engine/types';
import { FlowsService } from './flows.service';

const setupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  welcome: z.string().trim().min(1).max(1024),
  fallback: z.string().trim().min(1).max(1024),
  channelId: z.string().uuid(),
  productIds: z.array(z.string().uuid()).min(1).max(1000).optional(),
});
const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

@Controller('catalog-assistant')
@Roles('owner', 'admin')
export class CatalogAssistantController {
  constructor(private readonly db: DatabaseService, private readonly flows: FlowsService) {}

  private async check(tenant: string, setup: z.infer<typeof setupSchema>) {
    return this.db.withTenant(tenant, async (c) => {
      const products = (await c.query(
        `SELECT id,name,category_id,price_cents,currency,checkout,options,updated_at
           FROM catalog_products WHERE tenant_id=$1 AND NOT archived AND source_id IS NULL
           AND ($2::uuid[] IS NULL OR id=ANY($2)) ORDER BY category_id NULLS LAST,name,id LIMIT 1001 FOR SHARE`,
        [tenant, setup.productIds ?? null],
      )).rows;
      const channel = (await c.query(
        'SELECT id,type,status FROM channels WHERE tenant_id=$1 AND id=$2 FOR SHARE',
        [tenant, setup.channelId],
      )).rows[0];
      const blockers: string[] = [];
      const warnings: string[] = [];
      if (!channel || channel.status !== 'active') blockers.push('Choose an active channel in your workspace');
      if (!products.length || (setup.productIds && new Set(setup.productIds).size !== products.length))
        blockers.push('Choose available catalog items');
      if (products.length > 1000) blockers.push('Choose at most 1,000 products');
      for (const p of products) {
        if (!p.name.trim() || p.price_cents === null || !checkoutSchema.safeParse(p.checkout).success)
          blockers.push('Invalid checkout configuration: ' + p.name);
        if (!p.category_id) warnings.push('No category: ' + p.name);
        if (p.checkout?.stock === 0) blockers.push('Out of stock: ' + p.name);
      }
      const pages: { id: string; size: number; title: string }[] = [];
      const nodes: FlowNode[] = [];
      for (let offset = 0; offset < Math.min(products.length, 1000); offset += 10) {
        const batch = products.slice(offset, Math.min(offset + 10, 1000));
        const id = 'catalog_' + (pages.length + 1);
        pages.push({ id, size: batch.length, title: 'صفحة · Page ' + (pages.length + 1) });
        nodes.push({
          id, type: 'catalog', position: { x: 850, y: pages.length * 165 },
          data: { productIds: batch.map((p) => p.id), text: setup.name, selectable: true, native: false },
          edges: { next: 'end' },
        });
      }
      const makeMenu = (id: string, groups: typeof pages, x: number, y: number) => {
        nodes.push({
          id, type: 'interactive', position: { x, y },
          data: { text: setup.name, list: { buttonText: 'الصفحات · Pages', sections: [
            { rows: groups.map((g) => ({ id: g.id, title: g.title })) },
          ] } },
          edges: { ...Object.fromEntries(groups.map((g) => ['option:' + g.id, g.id])), fallback: 'fallback' },
        });
      };
      let browse = pages[0]?.id ?? 'end';
      if (pages.length > 1 && pages.length <= 10) {
        browse = 'pages';
        makeMenu(browse, pages, 450, 250);
      } else if (pages.length > 10) {
        browse = 'page_groups';
        const groups: typeof pages = [];
        for (let offset = 0; offset < pages.length; offset += 10) {
          const batch = pages.slice(offset, offset + 10);
          const id = 'pages_' + (groups.length + 1);
          groups.push({ id, size: batch.length, title: `Pages ${offset + 1}–${offset + batch.length}` });
          makeMenu(id, batch, 450, groups.length * 220);
        }
        makeMenu(browse, groups, 260, 240);
      }
      nodes.push(
        { id: 'welcome', type: 'interactive', position: { x: 80, y: 40 },
          data: { text: setup.welcome, buttons: [{ id: 'browse', title: 'الكتالوج · Catalog' }] },
          edges: { 'option:browse': browse, fallback: 'fallback' } },
        { id: 'fallback', type: 'message', position: { x: 80, y: 360 }, data: { text: setup.fallback }, edges: { next: 'end' } },
        { id: 'end', type: 'end', position: { x: 80, y: 590 }, data: {}, edges: {} },
      );
      const graph = { startNodeId: 'welcome', nodes };
      return { setup, products, channel: channel ?? null, graph, blockers, warnings,
        revision: fingerprint({ setup, products, channel }) };
    });
  }

  @Post('readiness')
  readiness(@Req() req: AuthedRequest, @Body() body: unknown) {
    return this.check(req.user.tenantId, parse(setupSchema, body));
  }

  @Post('draft')
  draft(@Req() req: AuthedRequest, @Body() body: unknown) {
    const { setup, revision } = parse(z.object({ setup: setupSchema, revision: z.string().length(64) }), body);
    const { tenantId, userId } = req.user;
    return this.db.withTenant(tenantId, async () => {
      const result = await this.check(tenantId, setup);
      if (result.blockers.length) throw new BadRequestException(result.blockers.join(' / '));
      if (result.revision !== revision) throw new ConflictException('Run readiness again');
      const flow = await this.flows.importFlow(tenantId, userId, parse(flowTransferSchema, {
        format: 'boat-two-flow', version: 1, name: setup.name, graph: result.graph, triggers: [],
      }));
      const updated = await this.flows.update(tenantId, flow.id, { channelIds: [setup.channelId] });
      return { id: flow.id, updatedAt: updated.updated_at };
    });
  }

  @Post('releases')
  release(@Req() req: AuthedRequest, @Body() body: unknown) {
    const input = parse(z.object({
      setup: setupSchema, revision: z.string().length(64), flowId: z.string().uuid(), confirm: z.literal(true),
    }), body);
    const tenant = req.user.tenantId;
    return this.db.withTenant(tenant, async (c) => {
      const result = await this.check(tenant, input.setup);
      if (result.blockers.length || result.revision !== input.revision) throw new ConflictException('Run readiness again');
      const graph = parse(flowTransferSchema, {
        format: 'boat-two-flow', version: 1, name: input.setup.name, graph: result.graph,
      }).graph;
      const same = await c.query(
        'SELECT id FROM flows WHERE tenant_id=$1 AND id=$2 AND draft_graph=$3::jsonb AND channel_ids=ARRAY[$4::uuid] FOR SHARE',
        [tenant, input.flowId, JSON.stringify(graph), input.setup.channelId],
      );
      if (!same.rows.length) throw new ConflictException('Generate a fresh draft before releasing');
      const { rows: [release] } = await c.query(
        'INSERT INTO commerce_demo_releases(tenant_id,flow_id,snapshot) VALUES($1,$2,$3) RETURNING id,flow_id,created_at',
        [tenant, input.flowId, JSON.stringify(result)],
      );
      return { ...release, mode: 'demo', sent: false };
    });
  }

  @Post('releases/:id/restore')
  restore(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    parse(z.object({ confirm: z.literal(true) }), body);
    return this.db.withTenant(req.user.tenantId, async (c) => {
      const { rows: [release] } = await c.query(
        `INSERT INTO commerce_demo_releases(tenant_id,flow_id,snapshot,restored_from)
         SELECT tenant_id,flow_id,snapshot,id FROM commerce_demo_releases WHERE tenant_id=$1 AND id=$2
         RETURNING id,flow_id,created_at,restored_from`,
        [req.user.tenantId, id],
      );
      if (!release) throw new NotFoundException('Demo release not found');
      return { ...release, mode: 'demo', sent: false };
    });
  }

  @Get('releases')
  releases(@Req() req: AuthedRequest) {
    return this.db.withTenant(req.user.tenantId, async (c) => (await c.query(
      'SELECT id,flow_id,created_at,restored_from FROM commerce_demo_releases ORDER BY created_at DESC LIMIT 50',
    )).rows);
  }
}
