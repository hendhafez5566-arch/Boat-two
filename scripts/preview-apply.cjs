const cp=require('node:child_process');const fs=require('node:fs');const crypto=require('node:crypto');
const files=[
 ['scripts/preview-redesign-css.cjs','apps/web/app/design-system.css','39e7305a5ef45db6eda32a186a067d17c2a9196bbddbd6d5a7856ff2b31e7156'],
 ['scripts/preview-redesign-sidebar.cjs','apps/web/app/dashboard/layout.tsx','5d518775916014d9b33b268aa67ffa8a312fa5ecf832de99f12a1bb8ace96997'],
 ['scripts/preview-redesign-bot-list.cjs','apps/web/app/dashboard/flows/page.tsx','06730d2b71ea8f87dd1c17e89bc654e747a2ec63d6cf8ab7abc063adf8de4d6b'],
 ['scripts/preview-redesign-bot-wizard.cjs','apps/web/app/dashboard/flows/new/page.tsx','78d2b1fc524bdc1dfb849b23519ac8ae0dfc8c2c4744e4a09dc98c26ba366c2a']
];for(const [script,path,expected] of files){cp.execFileSync(process.execPath,[script],{stdio:'inherit'});const actual=crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');if(actual!==expected)throw Error('Preview ZIP checksum mismatch: '+path);}
console.log('Boat-ui-redesign.zip exact frontend changes verified');
