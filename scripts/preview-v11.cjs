'use strict';
// Apply exact v10 -> v11-full UI differences; fail closed on source drift.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const baseDir = path.resolve(__dirname, '..');
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
const payload = fs.readFileSync(path.join(__dirname, 'preview-v11-patches.txt'), 'utf8').trim();
const expectedPayload = 'f262ba0351600034cc10e1b4fa06259974c0463051dda04ae61fae3413943817';
if(hash(Buffer.from(payload)) !== expectedPayload) throw new Error('v11 patch payload mismatch');
const patches = JSON.parse(zlib.brotliDecompressSync(Buffer.from(payload, 'base64')).toString('utf8'));
if (patches.length !== 5) throw new Error('Unexpected v11 patch file count');
for (const patch of patches) {
  const filename = path.resolve(baseDir, patch.p);
  if (!filename.startsWith(baseDir + path.sep)) throw new Error('Invalid v11 path');
  const source = fs.existsSync(filename) ? fs.readFileSync(filename) : Buffer.alloc(0);
  if (hash(source) === patch.b) continue;
  if (hash(source) !== patch.a) throw new Error('v11 base differs: ' + patch.p);
  const lines = source.toString('utf8').match(/[^\n]*\n|[^\n]+$/g) || [];
  for (const [start, end, added] of patch.o.slice().reverse()) {
    const replacements = added.match(/[^\n]*\n|[^\n]+$/g) || [];
    lines.splice(start, end - start, ...replacements);
  }
  const next = Buffer.from(lines.join(''), 'utf8');
  if (hash(next) !== patch.b) throw new Error('v11 output differs: ' + patch.p);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, next);
  console.log('v11 source exact:', patch.p);
}
console.log('Boat UI redesign v11-full verified, 5 files.');
