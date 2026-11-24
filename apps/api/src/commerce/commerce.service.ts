import { calculateCheckout, CheckoutProduct, Selection, conversationOrderSchema, orderSchema } from './checkout';
import { itemText } from './data-contracts';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { GoogleService } from '../integrations/google.service';
import { ExternalEffects } from '../events/external-effect';
import { OutContent } from '../flows/engine/types';
import { isIntervalOpen } from '../flows/engine/hours';
import { productSchema, serviceSchema, bookingSchema, priceText } from './contracts';
import { z } from 'zod';
@Injectable()
export class CommerceService {
  constructor(
    private db: DatabaseService,
    private google: GoogleService,
    private effects: ExternalEffects,
  ) {}
  categories(tenant: string) {
    return this.db.withTenant(
      tenant,
      async (c) => (await c.query('SELECT id,name,parent_id FROM product_categories ORDER BY name,id')).rows,
    );
  }
  saveCategory(tenant: string, name: string, id?: string, parentId?: string | null) {
    return this.db.withTenant(tenant, async (c) => {
      // Moves and copies in one tenant share a lock so overlapping edits cannot create a cycle.
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,115))', [tenant]);
      if (parentId) {
        const ancestry = await c.query(
          `WITH RECURSIVE ancestors AS (
             SELECT id, parent_id FROM product_categories WHERE tenant_id = $1 AND id = $2
             UNION
             SELECT p.id, p.parent_id FROM product_categories p
             JOIN ancestors a ON p.id = a.parent_id WHERE p.tenant_id = $1
           ) SELECT id FROM ancestors`,
          [tenant, parentId],
        );
        if (!ancestry.rows.length) throw new NotFoundException('Parent category unavailable');
        if (ancestry.rows.some((row) => row.id === id))
          throw new ConflictException('Choose a parent outside this category and its subcategories');
      }
      const result = id
        ? await c.query(
            `UPDATE product_categories SET name = $3,
               parent_id = CASE WHEN $5 THEN $4::uuid ELSE parent_id END
             WHERE tenant_id = $1 AND id = $2 RETURNING id,name,parent_id`,
            [tenant, id, name, parentId ?? null, parentId !== undefined],
          )
        : await c.query(
            `INSERT INTO product_categories(tenant_id,name,parent_id)
             VALUES($1,$2,$3) RETURNING id,name,parent_id`,
            [tenant, name, parentId ?? null],
          );
      if (!result.rows[0]) throw new NotFoundException('Category unavailable');
      return result.rows[0];
    });
  }
  async removeCategory(tenant: string, id: string) {
    return this.db.withTenant(tenant, async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,115))', [tenant]);
      // Composite foreign keys also protect against a concurrent product insert.
      const category = await c.query('SELECT id FROM product_categories WHERE id=$1 FOR UPDATE', [id]);
      if (!category.rows[0]) throw new NotFoundException('Category unavailable');
      const [products, children] = [
        await c.query('SELECT 1 FROM catalog_products WHERE category_id=$1 LIMIT 1', [id]),
        await c.query('SELECT 1 FROM product_categories WHERE parent_id=$1 LIMIT 1', [id]),
      ];
      if (products.rows.length)
        throw new ConflictException('Move all products, including archived products, before deleting this category');
      if (children.rows.length)
        throw new ConflictException('Move all subcategories before deleting this category');
      await c.query('DELETE FROM product_categories WHERE id=$1', [id]);
      return { deleted: true };
    });
  }
  async duplicateCategory(tenant: string, sourceId: string, name: string) {
    return this.db.withTenant(tenant, async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,115))', [tenant]);
      const result = await c.query(
        `WITH RECURSIVE subtree AS (
           SELECT id, parent_id, name FROM product_categories WHERE tenant_id = $1 AND id = $2
           UNION
           SELECT child.id, child.parent_id, child.name FROM product_categories child
           JOIN subtree parent ON parent.id = child.parent_id WHERE child.tenant_id = $1
         ), mapped AS MATERIALIZED (
           SELECT id, parent_id, name, gen_random_uuid() AS new_id FROM subtree
         ), new_categories AS (
           INSERT INTO product_categories (id, tenant_id, parent_id, name)
           SELECT node.new_id, $1,
                  CASE WHEN node.id = $2 THEN node.parent_id ELSE parent.new_id END,
                  CASE WHEN node.id = $2 THEN $3 ELSE node.name END
           FROM mapped node LEFT JOIN mapped parent ON node.parent_id = parent.id
           RETURNING id, tenant_id, name, parent_id
         ), copied AS (
           INSERT INTO catalog_products
             (tenant_id, category_id, sku, name, description, price_cents, currency,
              image_url, link_url, archived, specifications, options, checkout)
           SELECT destination.tenant_id, destination.id, 'COPY-' || gen_random_uuid()::text,
                  product.name, product.description, product.price_cents, product.currency,
                  product.image_url, product.link_url, product.archived,
                  product.specifications, product.options,
                  CASE WHEN product.checkout->>'stock' IS NULL THEN product.checkout
                       ELSE jsonb_set(product.checkout, '{stock}', '0') END
           FROM new_categories destination
           JOIN mapped node ON destination.id = node.new_id
           JOIN catalog_products product ON product.tenant_id = destination.tenant_id
           WHERE product.category_id = node.id AND product.source_id IS NULL
           RETURNING id
         )
         SELECT destination.id, destination.name, destination.parent_id,
                (SELECT count(*)::int FROM copied) AS product_count
         FROM new_categories destination JOIN mapped node ON destination.id = node.new_id
         WHERE node.id = $2`,
        [tenant, sourceId, name],
      );
      if (!result.rows[0]) throw new NotFoundException('Category unavailable');
      return result.rows[0];
    });
  }
  products(tenant: string) {
    return this.db.withTenant(
      tenant,
      async (c) =>
        (
          await c.query(
            'SELECT * FROM catalog_products WHERE source_id IS NULL ORDER BY archived,name LIMIT 500',
          )
        ).rows,
    );
  }
  productScope(tenant: string) {
    return this.db.withTenant(tenant, async (c) => (await c.query(
      `SELECT category_id, count(*)::int AS count FROM catalog_products
       WHERE tenant_id = $1 AND source_id IS NULL GROUP BY category_id`,
      [tenant],
    )).rows);
  }
  productPage(tenant: string, category: string, query: string, page: number) {
    return this.db.withTenant(tenant, async (c) => {
      const result = await c.query(
        `WITH RECURSIVE branch AS (
           SELECT id FROM product_categories WHERE tenant_id = $1 AND id = NULLIF(NULLIF($2, 'all'), 'none')::uuid
           UNION
           SELECT child.id FROM product_categories child
           JOIN branch parent ON child.parent_id = parent.id WHERE child.tenant_id = $1
         ), matches AS MATERIALIZED (
           SELECT p.id, p.name FROM catalog_products p
           WHERE p.tenant_id = $1 AND p.source_id IS NULL
             AND ($2 = 'all' OR ($2 = 'none' AND p.category_id IS NULL)
                  OR p.category_id IN (SELECT id FROM branch))
             AND ($3 = '' OR strpos(lower(p.name), lower($3)) > 0
                          OR strpos(lower(p.sku), lower($3)) > 0)
         ), totals AS (SELECT count(*)::int AS total FROM matches),
         scope AS (
           SELECT total, LEAST($4, GREATEST(1, (total + 9) / 10)) AS page FROM totals
         )
         SELECT scope.total, scope.page, COALESCE(
           (SELECT jsonb_agg(to_jsonb(p) ORDER BY selected.name, selected.id)
            FROM (
              SELECT id, name FROM matches ORDER BY name,id
              LIMIT 10 OFFSET ((scope.page - 1) * 10)
            ) selected
            JOIN catalog_products p ON p.tenant_id = $1 AND p.id = selected.id),
           '[]'::jsonb) AS rows
         FROM scope`,
        [tenant, category, query, page],
      );
      return result.rows[0];
    });
  }
  saveProduct(tenant: string, input: z.infer<typeof productSchema>, id?: string) {
    return this.db.withTenant(tenant, async (c) => {
      if (id && input.checkout !== undefined) {
        const current = (await c.query(
          'SELECT updated_at FROM catalog_products WHERE tenant_id=$1 AND id=$2 AND source_id IS NULL FOR UPDATE',
          [tenant, id],
        )).rows[0];
        if (!current || new Date(current.updated_at).getTime() !== Date.parse(input.checkoutUpdatedAt ?? ''))
          throw new ConflictException('Product changed. Reload before editing checkout configuration.');
      }
      // Editing the Archived checkbox must protect active bot references too;
      // otherwise it would bypass the dedicated guarded archive endpoint.
      if (id && input.archived) {
        const current = await c.query(
          'SELECT archived FROM catalog_products WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
          [tenant, id],
        );
        if (current.rows[0] && !current.rows[0].archived) {
          const token = `%${id}%`;
          const draft = await c.query(
            'SELECT 1 FROM flows WHERE tenant_id=$1 AND draft_graph::text LIKE $2 LIMIT 1',
            [tenant, token],
          );
          const versions = await c.query(
            'SELECT 1 FROM flow_versions WHERE tenant_id=$1 AND graph::text LIKE $2 LIMIT 1',
            [tenant, token],
          );
          const sessions = await c.query(
            'SELECT 1 FROM flow_sessions WHERE tenant_id=$1 AND state::text LIKE $2 LIMIT 1',
            [tenant, token],
          );
          if (draft.rows.length || versions.rows.length || sessions.rows.length) {
            throw new ConflictException(
              'Product is used in a bot draft, published version or session. Remove the reference before archiving it.',
            );
          }
        }
      }
      const result = await c.query(
        `INSERT INTO catalog_products(id,tenant_id,sku,name,description,price_cents,currency,image_url,link_url,catalog_id,retailer_id,archived,category_id,specifications,options,checkout) VALUES(COALESCE($1::uuid,gen_random_uuid()),$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,COALESCE($15::jsonb,'[]'),COALESCE($16::jsonb,'[]'),COALESCE($17::jsonb,'{}')) ON CONFLICT(id) DO UPDATE SET sku=EXCLUDED.sku,name=EXCLUDED.name,description=EXCLUDED.description,price_cents=EXCLUDED.price_cents,currency=EXCLUDED.currency,image_url=EXCLUDED.image_url,link_url=EXCLUDED.link_url,catalog_id=EXCLUDED.catalog_id,retailer_id=EXCLUDED.retailer_id,archived=EXCLUDED.archived,category_id=CASE WHEN $14 THEN EXCLUDED.category_id ELSE catalog_products.category_id END,specifications=COALESCE($15::jsonb,catalog_products.specifications),options=COALESCE($16::jsonb,catalog_products.options),checkout=COALESCE($17::jsonb,catalog_products.checkout),updated_at=clock_timestamp() WHERE catalog_products.source_id IS NULL RETURNING *`,
        [
          id ?? null,
          tenant,
          input.sku,
          input.name,
          input.description,
          input.priceCents,
          input.currency,
          input.imageUrl ?? null,
          input.linkUrl ?? null,
          input.catalogId ?? null,
          input.retailerId ?? null,
          input.archived,
          input.categoryId ?? null,
          input.categoryId !== undefined,
          input.specifications === undefined ? null : JSON.stringify(input.specifications),
          input.options === undefined ? null : JSON.stringify(input.options),
          input.checkout === undefined ? null : JSON.stringify(input.checkout),
        ],
      );
      return result.rows[0];
    });
  }
  localProduct(tenant: string, id: string) {
    return this.db.withTenant(tenant, async (c) => {
      const { rows: [product] } = await c.query(
        'SELECT * FROM catalog_products WHERE tenant_id=$1 AND id=$2 AND source_id IS NULL',
        [tenant, id],
      );
      if (!product) throw new NotFoundException('Product unavailable');
      return product;
    });
  }

  activeCheckoutProduct(tenant: string, id: string) {
    return this.db.withTenant(tenant, async (c) => {
      const { rows: [product] } = await c.query(
        `SELECT id,name,currency,price_cents,checkout,options FROM catalog_products
         WHERE tenant_id=$1 AND id=$2 AND NOT archived AND source_id IS NULL`,
        [tenant, id],
      );
      if (!product) throw new NotFoundException('Product unavailable');
      return product;
    });
  }

  async quote(tenant: string, input: Selection) {
    return this.db.withTenant(tenant, async (c) => {
      const { rows: [product] } = await c.query<CheckoutProduct>(
        'SELECT * FROM catalog_products WHERE tenant_id=$1 AND id=$2 AND NOT archived AND source_id IS NULL',
        [tenant, input.productId],
      );
      if (!product) throw new NotFoundException('Product unavailable');
      return calculateCheckout(product, input, true);
    });
  }

  createConversationOrder(tenant: string, actor: string | null, input: z.infer<typeof conversationOrderSchema>,
    checkout?: { terms: { totalCents: string | null; currency: string }; followup: boolean },
  ) {
    const { conversationId, channelId, ...selection } = input;
    return this.db.conversation(tenant, conversationId, () => this.db.withTenant(tenant, async (c) => {
      const { rows: [conversation] } = await c.query<{ contact_id: string }>(
        `SELECT contact_id FROM conversations
         WHERE tenant_id=$1 AND id=$2 AND channel_id=$3 FOR SHARE`,
        [tenant, conversationId, channelId],
      );
      if (!conversation) throw new NotFoundException('Conversation unavailable');
      return this.createOrder(tenant, actor, { ...selection, contactId: conversation.contact_id }, {
        conversationId, channelId,
      }, checkout);
    }));
  }

  async createOrder(tenant: string, actor: string | null, input: z.infer<typeof orderSchema>,
    origin?: { conversationId: string; channelId: string },
    checkout?: { terms: { totalCents: string | null; currency: string }; followup: boolean },
  ) {
    return this.db.withTenant(tenant, async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,116))', [tenant + ':' + input.requestId]);
      const request = JSON.stringify(origin ? { ...input, origin } : input);
      const { rows: [previous] } = await c.query(
        'SELECT id,contact_id,snapshot,status,created_at,request=$3::jsonb AS identical FROM commerce_orders WHERE tenant_id=$1 AND request_id=$2',
        [tenant, input.requestId, request],
      );
      if (previous) {
        if (!previous.identical) throw new ConflictException('Request ID already used for another order');
        const { identical, ...order } = previous;
        return order;
      }
      const { rows: [product] } = await c.query<CheckoutProduct>(
        'SELECT * FROM catalog_products WHERE tenant_id=$1 AND id=$2 AND NOT archived AND source_id IS NULL FOR UPDATE',
        [tenant, input.productId],
      );
      if (!product) throw new NotFoundException('Product unavailable');
      const snapshot = calculateCheckout(product, input);
      if (checkout && (snapshot.currency !== checkout.terms.currency || snapshot.totalCents !== checkout.terms.totalCents))
        throw new ConflictException('Checkout price changed');
      if (snapshot.kind === 'appointment') throw new BadRequestException('Use the appointment booking workflow');
      const contact = await c.query('SELECT id FROM contacts WHERE tenant_id=$1 AND id=$2', [tenant, input.contactId]);
      if (!contact.rows.length) throw new NotFoundException('Contact unavailable');
      if (snapshot.kind !== 'quote') {
        await c.query(
          `UPDATE catalog_products
           SET checkout=jsonb_set(checkout, '{stock}', to_jsonb((checkout->>'stock')::int-$3::int)),
               updated_at=clock_timestamp()
           WHERE tenant_id=$1 AND id=$2 AND checkout->>'stock' IS NOT NULL`,
          [tenant, input.productId, input.quantity],
        );
      }
      const { rows: [order] } = await c.query(
        `INSERT INTO commerce_orders(tenant_id,contact_id,request_id,request,snapshot,created_by)
         VALUES($1,$2,$3,$4,$5,$6) RETURNING id,contact_id,snapshot,status,created_at`,
        [tenant, input.contactId, input.requestId, request, JSON.stringify(snapshot), actor],
      );
      await c.query("INSERT INTO commerce_order_events(tenant_id,order_id,status,actor_id) VALUES($1,$2,'new',$3)",
        [tenant, order.id, actor]);
      await c.query('INSERT INTO crm_notes(tenant_id,contact_id,body,created_by) VALUES($1,$2,$3,$4)',
        [tenant, input.contactId, 'Order / طلب ' + order.id + ' — ' + snapshot.name, actor]);
      if (checkout?.followup) {
        await c.query(
          "INSERT INTO crm_tasks(tenant_id,contact_id,title,due_at) VALUES($1,$2,$3,now()+interval '1 day')",
          [tenant, input.contactId, 'Follow up on order / متابعة الطلب ' + order.id],
        );
      }
      return order;
    });
  }

  orderSummary(tenant: string) {
    return this.db.withTenant(tenant, async (c) => (await c.query<{ status: string; count: string }>(
      'SELECT status, count(*)::text AS count FROM commerce_orders WHERE tenant_id=$1 GROUP BY status',
      [tenant],
    )).rows);
  }

  orders(tenant: string, page: number, q = '', status?: string) {
    return this.db.withTenant(tenant, async (c) => (await c.query(
      `SELECT o.id,o.contact_id,c.name AS contact_name,o.status,o.snapshot,o.created_at,o.assigned_to, u.full_name AS assignee_name,
              o.request->'origin' AS origin
       FROM commerce_orders o JOIN contacts c ON (o.tenant_id,o.contact_id)=(c.tenant_id,c.id)
       LEFT JOIN memberships m ON (m.tenant_id,m.user_id)=(o.tenant_id,o.assigned_to)
       LEFT JOIN users u ON u.id=m.user_id AND u.disabled_at IS NULL
       WHERE o.tenant_id=$1
         AND ($3='' OR strpos(lower(c.name), lower($3)) > 0
           OR strpos(lower(o.snapshot->>'name'), lower($3)) > 0
           OR strpos(o.id::text, lower($3)) > 0)
         AND ($4::text IS NULL OR o.status::text=$4)
       ORDER BY o.created_at DESC,o.id DESC LIMIT 51 OFFSET $2`,
      [tenant, (page-1)*50, q, status ?? null],
    )).rows);
  }
  uploadOrderDocument(tenant: string, orderId: string, slot: number, file: { originalname: string; mimetype: string; buffer: Buffer }) {
    return this.db.withTenant(tenant, async (c) => {
      const { rows: [order] } = await c.query(
        'SELECT snapshot,status FROM commerce_orders WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
        [tenant, orderId],
      );
      if (!order || !order.snapshot.documents[slot]) throw new NotFoundException('Document slot unavailable');
      if (!['new','confirmed'].includes(order.status)) throw new ConflictException('Order is closed');
      const { rows: [document] } = await c.query(
        `INSERT INTO commerce_order_documents(tenant_id,order_id,slot,filename,mime,bytes)
         VALUES($1,$2,$3,$4,$5,$6)
         ON CONFLICT(tenant_id,order_id,slot) DO UPDATE SET filename=EXCLUDED.filename,mime=EXCLUDED.mime,bytes=EXCLUDED.bytes
         RETURNING slot,filename,mime`,
        [tenant, orderId, slot, file.originalname.slice(0,200), file.mimetype, file.buffer],
      );
      return document;
    });
  }

  orderDocuments(tenant: string, orderId: string) {
    return this.db.withTenant(tenant, async (c) => (await c.query(
      'SELECT slot,filename,mime FROM commerce_order_documents WHERE tenant_id=$1 AND order_id=$2 ORDER BY slot',
      [tenant, orderId],
    )).rows);
  }

  orderDocument(tenant: string, orderId: string, slot: number) {
    return this.db.withTenant(tenant, async (c) => {
      const { rows: [document] } = await c.query(
        'SELECT filename,mime,bytes FROM commerce_order_documents WHERE tenant_id=$1 AND order_id=$2 AND slot=$3',
        [tenant, orderId, slot],
      );
      if (!document) throw new NotFoundException('Document unavailable');
      return document;
    });
  }

  assignOrder(tenant: string, id: string, userId: string | null) {
    return this.db.withTenant(tenant, async (c) => {
      if (userId && !(await c.query(
        `SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id
         WHERE m.tenant_id=$1 AND m.user_id=$2 AND u.disabled_at IS NULL FOR SHARE OF m,u`,
        [tenant, userId],
      )).rowCount) throw new NotFoundException('Assignee unavailable');
      const { rows: [order] } = await c.query(
        'UPDATE commerce_orders SET assigned_to=$3 WHERE tenant_id=$1 AND id=$2 RETURNING id,assigned_to',
        [tenant, id, userId],
      );
      if (!order) throw new NotFoundException('Order unavailable');
      return order;
    });
  }

  async changeOrderStatus(tenant: string, actor: string, id: string, status: string) {
    return this.db.withTenant(tenant, async (c) => {
      const { rows: [order] } = await c.query(
        'SELECT id,status,snapshot FROM commerce_orders WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
        [tenant, id],
      );
      if (!order) throw new NotFoundException('Order unavailable');
      if (order.status === status) return { id, status };
      const transitions: Record<string, string[]> = {
        new: ['review', 'confirmed', 'cancelled'],
        review: ['documents_required', 'processing', 'confirmed', 'cancelled'],
        documents_required: ['review', 'processing', 'cancelled'],
        processing: ['documents_required', 'completed', 'cancelled'],
        confirmed: ['documents_required', 'processing', 'completed', 'cancelled'],
      };
      if (!transitions[order.status]?.includes(status)) throw new ConflictException('Invalid order transition');
      if (status === 'completed' && order.snapshot.documents.length) {
        const { rows: [documents] } = await c.query(
          'SELECT count(*)::int AS count FROM commerce_order_documents WHERE tenant_id=$1 AND order_id=$2',
          [tenant, id],
        );
        if (documents.count !== order.snapshot.documents.length)
          throw new ConflictException('Upload all required documents before completing this order');
      }
      if (status === 'cancelled' && order.snapshot.stockTracked) {
        await c.query(
          `UPDATE catalog_products
           SET checkout=jsonb_set(checkout,'{stock}', to_jsonb(LEAST(1000000,(checkout->>'stock')::int+$3::int))),
               updated_at=clock_timestamp()
           WHERE tenant_id=$1 AND id=$2 AND checkout->>'stock' IS NOT NULL`,
          [tenant, order.snapshot.productId, order.snapshot.quantity],
        );
      }
      await c.query('UPDATE commerce_orders SET status=$3 WHERE tenant_id=$1 AND id=$2', [tenant, id, status]);
      await c.query('INSERT INTO commerce_order_events(tenant_id, order_id,status,actor_id) VALUES($1,$2,$3,$4)',
        [tenant, id, status, actor]);
      return { id, status };
    });
  }

  orderHistory(tenant: string, id: string) {
    return this.db.withTenant(tenant, async (c) => (await c.query(
      'SELECT status,created_at FROM commerce_order_events WHERE tenant_id=$1 AND order_id=$2 ORDER BY created_at,id',
      [tenant, id],
    )).rows);
  }
  async archiveProduct(tenant: string, id: string) {
    return this.changeLocalProduct(tenant, id, 'archive');
  }
  async removeProduct(tenant: string, id: string) {
    return this.changeLocalProduct(tenant, id, 'delete');
  }
  private async changeLocalProduct(tenant: string, id: string, action: 'archive' | 'delete') {
    return this.db.withTenant(tenant, async (c) => {
      // Lock the local product before deciding what can be removed. Imported source data
      // is managed through its source workflow, never from this local-product endpoint.
      const product = await c.query(
        'SELECT id FROM catalog_products WHERE tenant_id=$1 AND id=$2 AND source_id IS NULL FOR UPDATE',
        [tenant, id],
      );
      if (!product.rows[0]) throw new NotFoundException('Product unavailable');
      // Product identifiers live in JSON graphs rather than foreign key columns.
      // Preserve draft graphs, every published version and running session state.
      // This intentionally fails closed for historical versions that can be restored.
      const token = `%${id}%`;
      const referencedInDraft = await c.query(
        'SELECT 1 FROM flows WHERE tenant_id=$1 AND draft_graph::text LIKE $2 LIMIT 1',
        [tenant, token],
      );
      const referencedInVersions = await c.query(
        'SELECT 1 FROM flow_versions WHERE tenant_id=$1 AND graph::text LIKE $2 LIMIT 1',
        [tenant, token],
      );
      const referencedInSessions = await c.query(
        'SELECT 1 FROM flow_sessions WHERE tenant_id=$1 AND state::text LIKE $2 LIMIT 1',
        [tenant, token],
      );
      if (
        referencedInDraft.rows.length ||
        referencedInVersions.rows.length ||
        referencedInSessions.rows.length
      ) {
        throw new ConflictException(
          'Product is used in a bot draft, published version or session. Remove the reference before deleting or archiving it.',
        );
      }
      if (action === 'archive') {
        const archived = await c.query(
          'UPDATE catalog_products SET archived=true, updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id, archived',
          [tenant, id],
        );
        return archived.rows[0];
      }
      try {
        const removed = await c.query(
          'DELETE FROM catalog_products WHERE tenant_id=$1 AND id=$2 RETURNING id',
          [tenant, id],
        );
        if (!removed.rows[0]) throw new NotFoundException('Product unavailable');
        return { deleted: true, id };
      } catch (error) {
        if ((error as { code?: string }).code === '23503') {
          throw new ConflictException(
            'Product is referenced by existing records. Keep it until dependencies are removed.',
          );
        }
        throw error;
      }
    });
  }
  async productContent(tenant: string, id: string, native: boolean): Promise<OutContent> {
    const p = await this.db.withTenant(
      tenant,
      async (c) =>
        (await c.query('SELECT * FROM catalog_products WHERE id=$1 AND NOT archived', [id]))
          .rows[0],
    );
    if (!p) throw new NotFoundException('Product unavailable');
    const text = p.source_id
      ? itemText(p)
      : `${p.name}\n${p.description.slice(0, 850)}\n${priceText(p.price_cents, p.currency)}`;
    if (native) {
      if (!p.catalog_id || !p.retailer_id)
        throw new BadRequestException(
          'Native product requires an approved provider catalog and retailer ID',
        );
      return {
        text: `${p.name}\n${p.description}`.slice(0, 1024),
        product: { catalogId: p.catalog_id, retailerId: p.retailer_id },
      };
    }
    return {
      text,
      ...(p.image_url ? { media: { kind: 'image' as const, url: p.image_url } } : {}),
      ...(p.link_url ? { cta: { text: 'View product', url: p.link_url } } : {}),
    };
  }
  async catalogContent(
    tenant: string,
    ids: string[],
    native: boolean,
    text: string,
    selectable = false,
  ): Promise<OutContent> {
    if (native) {
      const rows = await this.db.withTenant(
        tenant,
        async (c) =>
          (
            await c.query(
              'SELECT * FROM catalog_products WHERE id=ANY($1::uuid[]) AND NOT archived',
              [ids],
            )
          ).rows,
      );
      if (
        rows.length !== new Set(ids).size ||
        !rows.length ||
        rows.some((p) => !p.catalog_id || !p.retailer_id || p.catalog_id !== rows[0].catalog_id)
      )
        throw new BadRequestException('Products must belong to one approved provider catalog');
      return {
        text,
        productList: {
          catalogId: rows[0].catalog_id,
          sections: [
            {
              title: 'Products',
              retailerIds: ids.map((id) => rows.find((p) => p.id === id)!.retailer_id),
            },
          ],
        },
      };
    }
    const rows = await this.db.withTenant(
      tenant,
      async (c) =>
        (
          await c.query(
            'SELECT * FROM catalog_products WHERE id=ANY($1::uuid[]) AND NOT archived',
            [ids],
          )
        ).rows,
    );
    if (rows.length !== new Set(ids).size || !rows.length)
      throw new BadRequestException('Catalog contains unavailable products');
    const ordered = ids.map((id) => rows.find((p) => p.id === id)!);
    if (selectable) {
      if (ordered.length > 10)
        throw new BadRequestException('Selectable catalogs support at most 10 products');
      return {
        text,
        list: {
          buttonText: 'Products',
          sections: [
            {
              title: 'Products',
              rows: ordered.map((p) => ({
                id: 'product:' + p.id,
                title: p.name.slice(0, 24),
                description: (p.source_id
                  ? (p.dynamic_fields ?? [])
                      .map((f: { label: string; value: string }) => f.label + ': ' + f.value)
                      .join(' • ')
                  : priceText(p.price_cents, p.currency)
                ).slice(0, 72),
              })),
            },
          ],
        },
      };
    }
    return {
      text: [
        text,
        ...ordered.map(
          (p) =>
            `${p.name} — ${p.source_id ? itemText(p) : priceText(p.price_cents, p.currency)}${p.link_url ? ' ' + p.link_url : ''}`,
        ),
      ].join('\n'),
    };
  }
  services(tenant: string) {
    return this.db.withTenant(
      tenant,
      async (c) => (await c.query('SELECT * FROM appointment_services ORDER BY name')).rows,
    );
  }
  saveService(tenant: string, v: z.infer<typeof serviceSchema>) {
    return this.db.withTenant(tenant, async (c) => {
      if (
        v.calendarConnectionId &&
        !(
          await c.query("SELECT 1 FROM integration_connections WHERE id=$1 AND provider='google'", [
            v.calendarConnectionId,
          ])
        ).rowCount
      )
        throw new BadRequestException('Google connection not found');
      return (
        await c.query(
          'INSERT INTO appointment_services(tenant_id,name,duration_minutes,timezone,schedule,calendar_connection_id,calendar_id,enabled) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
          [
            tenant,
            v.name,
            v.durationMinutes,
            v.timezone,
            JSON.stringify(v.schedule),
            v.calendarConnectionId ?? null,
            v.calendarId,
            v.enabled,
          ],
        )
      ).rows[0];
    });
  }
  bookings(tenant: string) {
    return this.db.withTenant(
      tenant,
      async (c) =>
        (
          await c.query(
            'SELECT a.*,s.name AS service_name,ct.name AS contact_name FROM appointments a JOIN appointment_services s ON s.id=a.service_id JOIN contacts ct ON ct.id=a.contact_id ORDER BY a.starts_at DESC LIMIT 200',
          )
        ).rows,
    );
  }
  async book(tenant: string, input: z.infer<typeof bookingSchema>) {
    return this.db.withTenant(tenant, async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,116))', [
        `appointment:${tenant}:${input.eventKey}`,
      ]);
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [input.serviceId]);
      const prior = (
        await c.query('SELECT * FROM appointments WHERE event_key=$1', [input.eventKey])
      ).rows[0];
      if (prior) {
        if (
          prior.service_id !== input.serviceId ||
          prior.contact_id !== input.contactId ||
          new Date(prior.starts_at).getTime() !== new Date(input.start).getTime()
        )
          throw new ConflictException('Booking replay changed its input');
        return prior;
      }
      const service = (
        await c.query('SELECT * FROM appointment_services WHERE id=$1 AND enabled', [
          input.serviceId,
        ])
      ).rows[0];
      if (!service) throw new NotFoundException('Appointment service unavailable');
      if (!(await c.query('SELECT 1 FROM contacts WHERE id=$1', [input.contactId])).rowCount)
        throw new NotFoundException('Contact not found');
      const start = new Date(input.start),
        end = new Date(start.getTime() + service.duration_minutes * 60000);
      if (start <= new Date()) throw new BadRequestException('Choose a future appointment');
      if (
        Object.keys(service.schedule).length &&
        !isIntervalOpen(start, end, service.timezone, service.schedule)
      )
        throw new ConflictException('Outside service opening hours');
      const conflict = (
        await c.query(
          "SELECT 1 FROM appointments WHERE service_id=$1 AND status='confirmed' AND starts_at<$3 AND ends_at>$2 LIMIT 1",
          [input.serviceId, start, end],
        )
      ).rowCount;
      if (conflict) throw new ConflictException('Appointment slot is unavailable');
      if (input.dryRun)
        return {
          mock: true,
          persisted: false,
          available: true,
          start: start.toISOString(),
          end: end.toISOString(),
        };
      return (
        await c.query(
          'INSERT INTO appointments(tenant_id,service_id,contact_id,starts_at,ends_at,event_key,calendar_status) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
          [
            tenant,
            input.serviceId,
            input.contactId,
            start,
            end,
            input.eventKey,
            service.calendar_connection_id ? 'pending' : 'not_requested',
          ],
        )
      ).rows[0];
    });
  }
  cancel(tenant: string, id: string) {
    return this.db.withTenant(tenant, async (c) => {
      const result = await c.query("UPDATE appointments SET status='cancelled' WHERE id=$1 RETURNING *", [id]);
      if (!result.rows[0]) throw new NotFoundException('Appointment unavailable');
      return result.rows[0];
    });
  }
  async syncCalendar(tenant: string, id: string) {
    const row = await this.db.withTenant(
      tenant,
      async (c) =>
        (
          await c.query(
            "SELECT a.*,s.name,s.timezone,s.calendar_connection_id,s.calendar_id FROM appointments a JOIN appointment_services s ON s.id=a.service_id WHERE a.id=$1 AND a.status='confirmed'",
            [id],
          )
        ).rows[0],
    );
    if (!row?.calendar_connection_id)
      throw new BadRequestException('Booking has no authorized Calendar connection');
    if (row.calendar_event_id) return { alreadyLinked: true, id: row.calendar_event_id };
    try {
      const result = (await this.db.eventScope('appointment:' + id, () =>
        this.effects.execute(
          tenant,
          { bookingId: id, start: row.starts_at, end: row.ends_at },
          () =>
            this.google.execute(tenant, row.calendar_connection_id, {
              operation: 'calendar_event',
              calendarId: row.calendar_id,
              summary: row.name,
              start: new Date(row.starts_at).toISOString(),
              end: new Date(row.ends_at).toISOString(),
              timezone: row.timezone,
            }),
        ),
      )) as { data?: { id?: string } };
      if (!result.data?.id) throw new Error('Calendar returned no event ID');
      await this.db.withTenant(tenant, (c) =>
        c.query(
          "UPDATE appointments SET calendar_status='linked',calendar_event_id=$2,calendar_error=NULL WHERE id=$1",
          [id, result.data!.id],
        ),
      );
      return { linked: true, id: result.data.id };
    } catch (e) {
      await this.db.withTenant(tenant, (c) =>
        c.query(
          "UPDATE appointments SET calendar_status='needs_action',calendar_error=$2 WHERE id=$1",
          [id, 'Calendar authorization or delivery requires reconciliation'],
        ),
      );
      throw e;
    }
  }
}
