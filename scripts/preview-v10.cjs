'use strict';
// Reconstruct the exact changed files from the uploaded Boat-ui-redesign-v10.zip.
// Each patch verifies both base and target SHA-256; fail closed on source drift.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const apiOnly = process.argv.includes('--api');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
let done = 0, skipped = 0;
for (const group of ['flow', 'business', 'layout']) {
  const compressed = Buffer.from(fs.readFileSync(path.join(__dirname, 'preview-v10-' + group + '.txt'), 'utf8').trim(), 'base64');
  const patches = JSON.parse(zlib.brotliDecompressSync(compressed).toString('utf8'));
  for (const patch of patches) {
    if (apiOnly && !patch.p.startsWith('apps/api/')) continue;
    const target = path.resolve(__dirname, '..', patch.p);
    if (!target.startsWith(path.resolve(__dirname, '..') + path.sep)) throw new Error('Bad patch path');
    const oldSource = fs.existsSync(target) ? fs.readFileSync(target) : Buffer.alloc(0);
    if (sha(oldSource) === patch.b) { skipped++; continue; }
    if (sha(oldSource) !== patch.a) throw new Error('V10 base mismatch: ' + patch.p);
    const lines = oldSource.toString('utf8').match(/[^\n]*\n|[^\n]+$/g) || [];
    for (const [start, end, replacement] of patch.o.slice().reverse()) {
      const replacementLines = replacement.match(/[^\n]*\n|[^\n]+$/g) || [];
      lines.splice(start, end - start, ...replacementLines);
    }
    const next = Buffer.from(lines.join(''), 'utf8');
    if (sha(next) !== patch.b) throw new Error('V10 target mismatch: ' + patch.p);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, next);
    done++;
  }
}
console.log('Boat UI v10 verified and applied; changed=' + done + ', already-current=' + skipped + ', apiOnly=' + apiOnly);
