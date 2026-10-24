'use strict';
const fs = require('node:fs');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const bytes = zlib.brotliDecompressSync(Buffer.from(fs.readFileSync('scripts/preview-v10-flow-types.txt','utf8').trim(),'base64'));
const hash = crypto.createHash('sha256').update(bytes).digest('hex');
if (hash !== '9b52af3c07ed70be3c7046af38d683add8c968907b73dca982351f50a9daa94c') throw new Error('Invalid v10 flow types');
fs.writeFileSync('apps/web/lib/flow-types.ts',bytes);
console.log('Boat v10 flow types sourced from uploaded ZIP');
