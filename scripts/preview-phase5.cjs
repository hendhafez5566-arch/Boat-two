'use strict';
// Reconstruct the exact Phase 5 changes from the user-provided ZIP.
// Hash checks prevent combining incompatible versions of the app.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const groups = [
  ['api', 'ad315493481c342b66581241d14440b84577bfb258951c1a10dcf6d67beff052'],
  ['web', '1bc50bcd1b320e860e26f02de3e680bfe98f7f63fe7e835b7426edfd3a903d72'],
  ['other', 'd205e5e675c9012ea108896543976c6219f611f694dd506cf671724f84cc8445'],
];
const apiOnly = process.argv.includes('--api');
const webOnly = process.argv.includes('--web');
if (apiOnly === webOnly) throw new Error('Specify exactly one mode: --api or --web');
let count = 0;
for (const [group, expected] of groups) {
  if (apiOnly && group !== 'api') continue;
  if (webOnly && group === 'api') continue;
  const encoded = fs.readFileSync(path.join(__dirname, 'preview-phase5-' + group + '.txt'), 'utf8').trim();
  if (sha(Buffer.from(encoded)) !== expected) throw new Error('Phase 5 payload checksum mismatch: ' + group);
  const changes = JSON.parse(zlib.brotliDecompressSync(Buffer.from(encoded, 'base64')).toString('utf8'));
  for (const patch of changes) {
    const dest = path.resolve(root, patch.p);
    if (!dest.startsWith(root + path.sep)) throw new Error('Invalid patch path');
    const before = fs.existsSync(dest) ? fs.readFileSync(dest) : Buffer.alloc(0);
    if (sha(before) === patch.b) { console.log('Already Phase 5: ' + patch.p); continue; }
    if (sha(before) !== patch.a) throw new Error('Phase 5 source mismatch at ' + patch.p);
    const lines = before.toString('utf8').match(/[^\n]*\n|[^\n]+$/g) || [];
    for (const [start, end, replacement] of patch.o.slice().reverse()) {
      const r = replacement.match(/[^\n]*\n|[^\n]+$/g) || [];
      lines.splice(start, end - start, ...r);
    }
    const after = Buffer.from(lines.join(''), 'utf8');
    if (sha(after) !== patch.b) throw new Error('Phase 5 result mismatch at ' + patch.p);
    fs.mkdirSync(path.dirname(dest), {recursive: true});
    fs.writeFileSync(dest, after);
    count++;
    console.log('Phase 5 exact: ' + patch.p);
  }
}
console.log('Phase 5 ZIP sources applied and verified: ' + count + ' files; mode=' + (apiOnly ? 'api' : 'web'));
