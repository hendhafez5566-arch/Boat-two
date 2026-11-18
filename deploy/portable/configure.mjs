import {randomBytes} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const path=resolve(dirname(fileURLToPath(import.meta.url)),'.env');
const secret=()=>randomBytes(32).toString('hex');
writeFileSync(path,['COMPOSE_PROJECT_NAME=boat_demo',...['POSTGRES_PASSWORD','APP_DATABASE_PASSWORD','JWT_SECRET','ENCRYPTION_KEY','S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY'].map(k=>k+'='+secret())].join('\n')+'\n',{flag:'wx',mode:0o600});
console.log('Created private portable configuration. Existing configuration is never overwritten.');
