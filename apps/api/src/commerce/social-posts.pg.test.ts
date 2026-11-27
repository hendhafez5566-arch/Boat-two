import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { socialSchema } from './contracts';

test('social drafts preserve campaign metadata, migration is repeatable, and RLS blocks foreign accounts', async () => {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://test:test@localhost/test',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'test-only-secret-for-local-validation',
    ENCRYPTION_KEY: '0'.repeat(64),
    EXTERNAL_DELIVERY_ENABLED: 'false',
  });
  const { SocialService } = await import('./social.service');
  const { ExternalEffects } = await import('../events/external-effect');
  const { env } = await import('../config/env');
  const originalFetch=globalThis.fetch;
  const pg = new PGlite();
  const tenant = '11111111-1111-4111-8111-111111111111',
    other = '22222222-2222-4222-8222-222222222222';
  const fb = '33333333-3333-4333-8333-333333333333',
    foreign = '44444444-4444-4444-8444-444444444444',
    ig = '55555555-5555-4555-8555-555555555555';
  const migration = readFileSync('src/database/migrations/093_social_post_name.sql', 'utf8');
  let active: { query: (sql: string, args?: unknown[]) => Promise<unknown> } | null = null;
  const wrap = (tx: {
    query: (sql: string, args?: unknown[]) => Promise<{ rows: unknown[]; affectedRows?: number }>;
  }) => ({
    query: async (sql: string, args?: unknown[]) => {
      const r = await tx.query(sql, args);
      return { ...r, rowCount: r.affectedRows || r.rows.length };
    },
  });
  let scope:{id:string;counter:number}|null=null;
  const db = {
    query: (sql:string,args:unknown[]=[])=>pg.query(sql,args),
    effectKey:()=>scope?scope.id+':'+scope.counter++:null,
    eventScope:async<T>(id:string,fn:()=>Promise<T>)=>{scope={id,counter:0};try{return await fn();}finally{scope=null;}},
    detached:(id:string,fn:(c:unknown)=>Promise<unknown>):Promise<unknown>=>db.withTenant(id,fn),
    withTenant: async (id: string, fn: (c: unknown) => Promise<unknown>) => {
      if (active) return fn(active);
      return pg.transaction(async (tx) => {
        await tx.exec('SET LOCAL ROLE app_user');
        await tx.query("SELECT set_config('app.tenant_id',$1,true)", [id]);
        active = wrap(tx);
        try {
          return await fn(active);
        } finally {
          active = null;
        }
      });
    },
  };
  try {
    await pg.exec(`CREATE ROLE app_user NOSUPERUSER NOBYPASSRLS;
      CREATE TABLE channels(id uuid PRIMARY KEY,tenant_id uuid,name text,type text,status text DEFAULT 'active',external_id text DEFAULT 'synthetic',credentials_enc text);
      CREATE TABLE social_posts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,channel_id uuid,kind text,body text,media_urls jsonb,link_url text,status text DEFAULT 'draft',created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),scheduled_at timestamptz,lease_until timestamptz,error text,provider_id text);
      CREATE TABLE external_effects(tenant_id uuid,effect_key text,request_hash text,status text,result jsonb,error text,PRIMARY KEY(tenant_id,effect_key));
      ALTER TABLE external_effects ENABLE ROW LEVEL SECURITY; ALTER TABLE external_effects FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_policy ON external_effects USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
      GRANT SELECT,INSERT,UPDATE ON external_effects TO app_user;
      CREATE FUNCTION social_post_due(p_limit int) RETURNS TABLE(id uuid,tenant_id uuid) LANGUAGE sql AS $ SELECT id,tenant_id FROM social_posts WHERE (status='scheduled' AND scheduled_at<=now()) OR (status='sending' AND lease_until<now()) ORDER BY scheduled_at LIMIT p_limit $;
      ALTER TABLE channels ENABLE ROW LEVEL SECURITY; ALTER TABLE channels FORCE ROW LEVEL SECURITY;
      ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY; ALTER TABLE social_posts FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_policy ON channels USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
      CREATE POLICY tenant_policy ON social_posts USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
      GRANT SELECT ON channels TO app_user; GRANT SELECT,INSERT,UPDATE ON social_posts TO app_user;
    `);
    await pg.query(
      "INSERT INTO channels(id,tenant_id,name,type) VALUES($1,$2,'Page','facebook'),($3,$4,'Foreign','facebook'),($5,$2,'IG','instagram')",
      [fb, tenant, foreign, other, ig],
    );
    await pg.exec(migration);
    const service = new SocialService(db as never, {credentials:()=>({pageAccessToken:'synthetic-test-only'})} as never, new ExternalEffects(db as never));
    const input = socialSchema.parse({
      name: '  Campaign  ',
      format: 'multimedia',
      channelId: fb,
      kind: 'carousel',
      body: 'Text',
      mediaUrls: ['https://example.test/one.png', 'https://example.test/two.png'],
    });
    const saved = await service.save(tenant, input);
    assert.equal(saved.name, 'Campaign');
    assert.equal(saved.format, 'multimedia');
    assert.equal(saved.status, 'draft');
    await pg.exec(migration); // A new multimedia carousel must keep its explicit category.
    const listed = await service.list(tenant);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].format, 'multimedia');
    const edited = await service.save(tenant, { ...input, name: 'Changed' }, saved.id);
    assert.equal(edited.name, 'Changed');
    const legacyEdit = await service.save(
      tenant,
      { ...input, name: undefined, format: undefined },
      saved.id,
    );
    assert.equal(legacyEdit.name, 'Changed');
    assert.equal(legacyEdit.format, 'multimedia');
    await assert.rejects(service.save(other, input), /Choose a Facebook/);
    await assert.rejects(
      service.save(tenant, { ...input, channelId: foreign }),
      /Choose a Facebook/,
    );
    await assert.rejects(
      service.save(tenant, socialSchema.parse({ channelId: ig, kind: 'text', body: 'No image' })),
      /Instagram publishing requires/,
    );
    await pg.query("UPDATE social_posts SET status='failed' WHERE id=$1", [saved.id]);
    const retry = await service.retry(tenant, saved.id);
    assert.equal(retry.name, 'Changed');
    assert.equal(retry.format, 'multimedia');
    assert.equal(retry.status, 'draft');
    await assert.rejects(service.save(tenant, input, saved.id), /Only a draft/);
    const legacy = await service.save(
      tenant,
      socialSchema.parse({
        channelId: fb,
        kind: 'cta',
        body: 'CTA',
        linkUrl: 'https://example.test',
      }),
    );
    assert.equal(legacy.format, 'cta');
    assert.equal(socialSchema.safeParse({ ...input, name: 'a'.repeat(121) }).success, false);
    assert.equal(socialSchema.safeParse({ ...input, format: 'invented' }).success, false);
    assert.equal(socialSchema.safeParse({ ...input, format: 'cta' }).success, false);
    // Search all stored records, not just the legacy latest 200; escape SQL wildcard characters.
    const older=await service.save(tenant,socialSchema.parse({channelId:fb,format:'multimedia',kind:'text',name:'Literal_% older',body:'Searchable'}));
    await pg.query("INSERT INTO social_posts(tenant_id,channel_id,kind,body,media_urls,name,format) SELECT $1,$2,'text','Bulk draft','[]','Newer '||n,'multimedia' FROM generate_series(1,205) n",[tenant,fb]);
    await pg.query("UPDATE social_posts SET created_at=now()-interval '1 day' WHERE id=$1",[older.id]);
    const index=await service.index(tenant,{format:'multimedia',q:'Literal_%',page:1,limit:10});
    assert.equal(index.total,1);assert.equal(index.items[0].id,older.id);
    const page2=await service.index(tenant,{format:'multimedia',q:'Newer ',page:2,limit:10});
    assert.equal(page2.total,205);assert.equal(page2.items.length,10);
    assert.equal((await service.index(other,{q:'Literal_%',page:1,limit:10})).total,0);
    await assert.rejects(()=>service.detail(other,older.id),/Post not found/);
    assert.equal(socialSchema.safeParse({...input,mediaUrls:['https://example.test/a.png','https://example.test/a.png']}).success,false);
    assert.equal(socialSchema.safeParse({...input,body:'   '}).success,false);
    assert.equal(socialSchema.safeParse({channelId:fb,kind:'cta',body:'test',linkUrl:'javascript:alert(1)'}).success,false);
    await assert.rejects(()=>service.queue(tenant,older.id,new Date(Date.now()+60000).toISOString()),/disabled/);
    // Provider is an in-process fake, never a real network call. Exercise the real worker and effect ledger.
    const requests:{url:string;body:any}[]=[];let readiness=0;
    globalThis.fetch=async(url,options)=>{assert.match(String(url),/^https:\/\/graph.facebook.com\/v21\.0\//);const body=options?.body?JSON.parse(String(options.body)):null;requests.push({url:String(url),body});if(body?.message==='Ambiguous fixture')throw Error('Synthetic lost response');if(String(url).includes('fields=status_code'))return new Response(JSON.stringify({status_code:readiness++===0?'IN_PROGRESS':'FINISHED'}));return new Response(JSON.stringify({id:'fake-'+requests.length}));};
    env.EXTERNAL_DELIVERY_ENABLED='true';
    await service.queue(tenant,older.id,new Date(Date.now()+60000).toISOString());
    assert.equal((await service.cancel(tenant,older.id)).status,'draft');
    await assert.rejects(()=>service.cancel(tenant,older.id),/Only a scheduled/);
    const carousel=await service.save(tenant,{...input,name:'Worker carousel'});
    await service.queue(tenant,carousel.id,new Date().toISOString());await service.tick();
    assert.equal((await service.detail(tenant,carousel.id)).status,'published');
    assert.ok(requests.some(r=>r.body?.attached_media?.length===2));
    const reel=await service.save(tenant,socialSchema.parse({channelId:ig,kind:'video',body:'Synthetic reel',mediaUrls:['https://example.test/reel.mp4']}));
    await service.queue(tenant,reel.id,new Date().toISOString());await service.tick();
    assert.equal((await service.detail(tenant,reel.id)).status,'scheduled');
    await assert.rejects(()=>service.cancel(tenant,reel.id),/Only a scheduled/);
    await pg.query('UPDATE social_posts SET scheduled_at=now() WHERE id=$1',[reel.id]);await service.tick();
    assert.equal((await service.detail(tenant,reel.id)).status,'published');
    assert.equal(requests.filter(r=>r.body?.media_type==='REELS').length,1);assert.equal(requests.filter(r=>r.url.endsWith('/media_publish')).length,1);
    const ambiguous=await service.save(tenant,socialSchema.parse({channelId:fb,kind:'text',body:'Ambiguous fixture'}));
    await service.queue(tenant,ambiguous.id,new Date().toISOString());await service.tick();
    assert.equal((await service.detail(tenant,ambiguous.id)).status,'ambiguous');const attempts=requests.length;await service.tick();assert.equal(requests.length,attempts);
    assert.equal((await service.retry(tenant,ambiguous.id)).status,'draft');assert.equal(requests.length,attempts);

  } finally {
    globalThis.fetch=originalFetch;env.EXTERNAL_DELIVERY_ENABLED='false';
    await pg.close();
  }
});
