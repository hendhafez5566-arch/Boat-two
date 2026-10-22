import assert from 'node:assert/strict';
import { test } from 'node:test';
import { escapeLike, pickLeastLoaded } from './assignment';
import { isStoredName, kindFromMime, mimeFromStoredName, newStoredName, safeDownloadName, sniffMatches } from './files/storage';
import { TenantBus } from './realtime/tenant-bus';

test('TenantBus isolates tenants, unsubscribes, survives bad listeners', () => {
  const bus = new TenantBus<{ n: number }>();
  const a: number[] = [];
  const b: number[] = [];
  const offA = bus.subscribe('t1', (e) => a.push(e.n));
  bus.subscribe('t1', () => { throw new Error('boom'); });
  bus.subscribe('t2', (e) => b.push(e.n));
  bus.publish('t1', { n: 1 });
  bus.publish('t2', { n: 2 });
  assert.deepEqual(a, [1]);
  assert.deepEqual(b, [2]);
  assert.equal(bus.size('t1'), 2);
  offA();
  bus.publish('t1', { n: 3 });
  assert.deepEqual(a, [1]);
  assert.equal(bus.size('t1'), 1);
  assert.equal(bus.size('nobody'), 0);
  bus.publish('nobody', { n: 9 }); // لا يرمي
});

test('pickLeastLoaded: lowest load, respects cap, random tie-break', () => {
  const c = [{ userId: 'a', open: 3 }, { userId: 'b', open: 1 }, { userId: 'c', open: 1 }, { userId: 'd', open: 9 }];
  assert.equal(pickLeastLoaded(c, 10, () => 0), 'b');
  assert.equal(pickLeastLoaded(c, 10, () => 0.99), 'c');
  assert.equal(pickLeastLoaded(c, 2, () => 0), 'b');
  assert.equal(pickLeastLoaded([{ userId: 'a', open: 5 }], 5), null);
  assert.equal(pickLeastLoaded([], 5), null);
  assert.equal(pickLeastLoaded([{ userId: 'x', open: 0 }], 5, () => 1), 'x');
});

test('escapeLike neutralizes wildcards', () => {
  assert.equal(escapeLike('100%_off\\'), '100\\%\\_off\\\\');
  assert.equal(escapeLike('عادي'), 'عادي');
});

test('storage: names, kinds, sniffing, download names', () => {
  const n = newStoredName('image/png')!;
  assert.ok(isStoredName(n) && n.endsWith('.png'));
  assert.equal(newStoredName('application/x-msdownload'), null);
  assert.equal(newStoredName('text/html'), null);
  assert.notEqual(newStoredName('image/png'), n);
  for (const bad of ['../etc/passwd', 'a.png', `${'a'.repeat(48)}.exe1234`, `${'g'.repeat(48)}.png`, `${'a'.repeat(48)}.png/../x`]) assert.equal(isStoredName(bad), false, bad);
  assert.equal(mimeFromStoredName(n), 'image/png');
  assert.equal(mimeFromStoredName('x.unknown'), null);

  assert.equal(kindFromMime('image/webp'), 'image');
  assert.equal(kindFromMime('audio/ogg'), 'audio');
  assert.equal(kindFromMime('video/mp4'), 'video');
  assert.equal(kindFromMime('application/pdf'), 'file');

  assert.equal(sniffMatches('image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0])), true);
  assert.equal(sniffMatches('image/png', Buffer.from('<html>')), false);
  assert.equal(sniffMatches('image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0])), true);
  assert.equal(sniffMatches('application/pdf', Buffer.from('%PDF-1.7')), true);
  assert.equal(sniffMatches('application/pdf', Buffer.from('MZ....')), false);
  assert.equal(sniffMatches('image/webp', Buffer.from('RIFF1234WEBPxxxx')), true);
  assert.equal(sniffMatches('audio/mpeg', Buffer.from('anything')), true);

  const dn = safeDownloadName('../../x"y\n.pdf');
  assert.equal(dn, '_.._x_y_.pdf');
  assert.ok(!/[\\/"\n]/.test(dn) && !dn.startsWith('.'));
  assert.equal(safeDownloadName('...'), 'file');
  assert.equal(safeDownloadName('فاتورة.pdf'), 'فاتورة.pdf');
});
