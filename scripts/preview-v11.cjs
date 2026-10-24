'use strict';
// Legacy Railway command compatibility: the verified output is tracked directly.
const fs = require('node:fs');
const path = require('node:path');
if (!fs.existsSync(path.resolve(__dirname, '../PREVIEW_SOURCE.json'))) throw new Error('Tracked preview source marker missing');
console.log('Using tracked V10/V11/Phase 5 source; no patches applied');
