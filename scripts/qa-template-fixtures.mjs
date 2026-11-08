import { randomUUID } from 'node:crypto';
// Imported only by the loopback-only isolated QA server when explicitly enabled.
export function installTemplateFixtures(app, local) {
  const { JwtService } = local('@nestjs/jwt');
  const { DatabaseService } = local('./dist/database/database.service');
  app
    .getHttpAdapter()
    .getInstance()
    .post('/__qa/templates/channel', async (req, res) => {
      try {
        const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
        const actor = await app.get(JwtService).verifyAsync(token);
        if (actor.role !== 'owner' || !actor.tid)
          return res.status(403).json({ error: 'Owner fixture only' });
        const row = await app
          .get(DatabaseService)
          .withTenant(
            actor.tid,
            async (c) =>
              (
                await c.query(
                  "INSERT INTO channels(tenant_id,type,name,external_id,settings) VALUES($1,'whatsapp','Isolated template QA',$2,'{}') RETURNING id",
                  [actor.tid, 'template-qa-' + randomUUID()],
                )
              ).rows[0],
          );
        res.json(row);
      } catch {
        res.status(403).json({ error: 'Invalid fixture session' });
      }
    });
}
