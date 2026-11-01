// Only installed by qa-full-api with BOAT_CRM_QA=true, on loopback with synthetic secrets.
// No production AppModule route, external delivery or real customer data is involved.
import { randomUUID } from 'node:crypto';
export function installCrmFixtures(app, local) {
  const { DatabaseService } = local('./dist/database/database.service');
  const { CrmJobs } = local('./dist/business/crm-jobs');
  const { MessagingService } = local('./dist/messaging/messaging.service');
  const { AutomationService } = local('./dist/business/automation.service');
  const db = app.get(DatabaseService);
  app
    .getHttpAdapter()
    .getInstance()
    .post('/__qa/crm', async (req, res) => {
      try {
        const { tenantId, op, contactId, phone } = req.body;
        if (!/^[0-9a-f-]{36}$/.test(tenantId)) throw Error('Synthetic tenant required');
        if (op === 'seed') {
          await db.withTenant(tenantId, async (c) =>
            c.query(
              "INSERT INTO contacts(tenant_id,name,email) SELECT $1,'Load customer '||n,'load-'||n||'@example.test' FROM generate_series(1,3000) n",
              [tenantId],
            ),
          );
          res.json({ seeded: 3000 });
        } else if (op === 'jobs') {
          for (let i = 0; i < 110; i++) {
            const jobs = await db.withTenant(
              tenantId,
              async (c) =>
                (
                  await c.query(
                    "SELECT id FROM crm_jobs WHERE kind='import' AND status IN ('pending','running')",
                  )
                ).rows,
            );
            if (!jobs.length) break;
            for (const job of jobs) await app.get(CrmJobs).process({ tenantId, jobId: job.id });
          }
          res.json({ processed: true });
        } else if (op === 'inbound') {
          const channel = await db.withTenant(
            tenantId,
            async (c) =>
              (
                await c.query(
                  "INSERT INTO channels(tenant_id,name,type,status,external_id) VALUES($1,'Synthetic WhatsApp','whatsapp','active',gen_random_uuid()::text) RETURNING *",
                  [tenantId],
                )
              ).rows[0],
          );
          await app.get(MessagingService).receive(channel, {
            contactExternalId: phone,
            contactName: 'Synthetic inbound',
            externalMessageId: randomUUID(),
            content: { text: 'Local inbound only' },
          });
          res.json({ channelId: channel.id });
        } else if (op === 'automation') {
          const event = await db.withTenant(
            tenantId,
            async (c) =>
              (
                await c.query(
                  "SELECT * FROM domain_events WHERE type='crm.contacts.update' AND payload->>'contactId'=$1 ORDER BY created_at DESC LIMIT 1",
                  [contactId],
                )
              ).rows[0],
          );
          if (!event) throw Error('Missing real domain event');
          await app
            .get(AutomationService)
            .handle({ id: event.id, tenantId, type: event.type, payload: event.payload });
          await app
            .get(AutomationService)
            .handle({ id: event.id, tenantId, type: event.type, payload: event.payload });
          res.json({ handled: true });
        } else throw Error('Unknown fixture operation');
      } catch (e) {
        res.status(500).json({ message: e.message });
      }
    });
}
