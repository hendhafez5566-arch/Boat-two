import { Global, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'node:crypto';
import { ExternalEffects } from './external-effect';
import { DatabaseService } from '../database/database.service';
export interface DomainEvent {
  id: string;
  tenantId: string;
  type: string;
  payload: Record<string, unknown>;
}
@Injectable()
export class EventsService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private log = new Logger(EventsService.name);
  constructor(
    private db: DatabaseService,
    private emitter: EventEmitter2,
  ) {}
  async publish(
    tenantId: string,
    type: string,
    aggregateId: string,
    payload: unknown,
    key: string = randomUUID(),
    availableAt?: string,
  ) {
    return this.db.withTenant(tenantId, (c) =>
      c.query(
        `INSERT INTO domain_events(tenant_id,type,aggregate_id,payload,dedupe_key,available_at) VALUES($1,$2,$3,$4,$5,COALESCE($6::timestamptz,now())) ON CONFLICT(tenant_id,dedupe_key) DO NOTHING RETURNING id`,
        [tenantId, type, aggregateId, JSON.stringify(payload), key, availableAt ?? null],
      ),
    );
  }
  onModuleInit() {
    if (process.env.NODE_ENV !== 'test') {
      this.timer = setInterval(() => void this.tick(), 500);
      this.timer.unref();
    }
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.db.query('SELECT materialize_realtime(1000)');
      const due = await this.db.query<{ id: string; tenant_id: string }>(
        'SELECT * FROM event_due(30)',
      );
      for (const item of due.rows) {
        try {
          await this.db.withTenant(item.tenant_id, async (c) => {
            const row = (
              await c.query(
                "SELECT * FROM domain_events WHERE id=$1 AND status='pending' AND available_at<=now() FOR UPDATE SKIP LOCKED",
                [item.id],
              )
            ).rows[0];
            if (!row) return;
            await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
              row.aggregate_id,
            ]);
            // Keep events for an aggregate ordered, even across different worker replicas.
            if (
              (
                await c.query(
                  "SELECT 1 FROM domain_events WHERE aggregate_id=$1 AND seq<$2 AND status<>'completed' AND (available_at<=now() OR status='failed') LIMIT 1",
                  [row.aggregate_id, row.seq],
                )
              ).rowCount
            )
              return;
            await c.query("SELECT set_config('app.root_event_id',$1,true)", [row.root_id]);
            await this.db.eventScope(row.id, async () => {
              await this.emitter.emitAsync(row.type, {
                ...row.payload,
                tenantId: item.tenant_id,
                eventId: row.id,
              });
              await this.emitter.emitAsync('domain.event', {
                id: row.id,
                tenantId: item.tenant_id,
                type: row.type,
                payload: row.payload,
              } satisfies DomainEvent);
            });
            await c.query(
              "UPDATE domain_events SET status='completed',completed_at=now(),error=NULL WHERE id=$1",
              [row.id],
            );
          });
        } catch (e) {
          await this.db.withTenant(item.tenant_id, (c) =>
            c.query(
              "UPDATE domain_events SET attempts=attempts+1,status=CASE WHEN attempts>=4 THEN 'failed' ELSE 'pending' END,error=$2,available_at=now()+interval '10 seconds' WHERE id=$1 AND status='pending'",
              [item.id, (e as Error).message.slice(0, 300)],
            ),
          );
        }
      }
    } catch (e) {
      this.log.error((e as Error).message);
    } finally {
      this.running = false;
    }
  }
}
@Global()
@Module({ providers: [EventsService, ExternalEffects], exports: [EventsService, ExternalEffects] })
export class EventsModule {}
