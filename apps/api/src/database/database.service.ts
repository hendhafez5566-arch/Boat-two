import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, QueryResultRow } from 'pg';
import { requestContext } from '../common/request-context';
import { env } from '../config/env';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private context = new AsyncLocalStorage<{ tenantId: string; client: PoolClient }>();
  private effects = new AsyncLocalStorage<{ id: string; counter: number }>();
  private readonly effectPool = new Pool({ connectionString: env.DATABASE_URL, max: 4 });
  async detached<T>(tenantId: string, fn: (c: PoolClient) => Promise<T>) {
    const client = await this.effectPool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
      const result = await this.context.run({ tenantId, client }, () => fn(client));
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  eventScope<T>(id: string, fn: () => Promise<T>) {
    return this.effects.run({ id, counter: 0 }, fn);
  }
  effectKey() {
    const effect = this.effects.getStore();
    return effect ? `${effect.id}:${effect.counter++}` : null;
  }
  async conversation<T>(tenantId: string, id: string, fn: () => Promise<T>) {
    return this.withTenant(tenantId, async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [id]);
      return fn();
    });
  }
  private readonly pool = new Pool({ connectionString: env.DATABASE_URL });

  query<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []) {
    return this.pool.query<T>(sql, params);
  }

  /** تنفيذ داخل transaction مع ضبط الشركة الحالية ليعمل Row Level Security */
  async withTenant<T>(tenantId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const active = this.context.getStore();
    if (active) {
      if (active.tenantId !== tenantId) throw new Error('Cross-tenant nested transaction denied');
      return fn(active.client);
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      const actor = requestContext.getStore()?.user;
      if (actor?.tenantId === tenantId)
        await client.query("SELECT set_config('app.actor_id', $1, true)", [actor.userId]);
      const result = await this.context.run({ tenantId, client }, () => fn(client));
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy() {
    await Promise.all([this.pool.end(), this.effectPool.end()]);
  }
}
