import {test} from 'node:test';
import assert from 'node:assert/strict';
import {previewReviewAllowed,previewReviewPermissions} from './preview-signin';
import {platformPermissions} from './permissions';
test('temporary review requires exact operator and preview environment and expires',()=>{
 const now=Date.parse('2026-11-28T12:00:00Z');
 const config={BOAT_PREVIEW_ONLY:'true',RAILWAY_ENVIRONMENT_NAME:'preview',PLATFORM_ADMIN_USER_IDS:'operator, other',PLATFORM_PREVIEW_REVIEW_USER_ID:'operator',PLATFORM_PREVIEW_REVIEW_UNTIL:new Date(now+3600000).toISOString()};
 assert.equal(previewReviewAllowed('operator',config,now),true);
 assert.equal(previewReviewAllowed('other',config,now),false);
 assert.equal(previewReviewAllowed('operator',{...config,RAILWAY_ENVIRONMENT_NAME:'production'},now),false);
 assert.equal(previewReviewAllowed('operator',{...config,BOAT_PREVIEW_ONLY:'false'},now),false);
 assert.equal(previewReviewAllowed('operator',{...config,PLATFORM_ADMIN_USER_IDS:'other'},now),false);
 assert.equal(previewReviewAllowed('operator',{...config,PLATFORM_PREVIEW_REVIEW_UNTIL:'invalid'},now),false);
 assert.equal(previewReviewAllowed('operator',config,now+3600000),false);
 assert.equal(previewReviewAllowed('operator',{...config,PLATFORM_PREVIEW_REVIEW_UNTIL:new Date(now+25*3600000).toISOString()},now),false);
 assert.deepEqual(previewReviewPermissions([...platformPermissions]),platformPermissions.filter(p=>p.endsWith('.read')));
});
