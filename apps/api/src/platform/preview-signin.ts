import type { PlatformPermission } from './permissions';
/** Password-only review is opt-in, scoped to one pre-authorized operator and
 * expires automatically. It is never a replacement for administrative MFA. */
export function previewReviewAllowed(userId:string, config:NodeJS.ProcessEnv=process.env, now=Date.now()):boolean{
  if(config.BOAT_PREVIEW_ONLY!=='true'||config.RAILWAY_ENVIRONMENT_NAME!=='preview')return false;
  const id=config.PLATFORM_PREVIEW_REVIEW_USER_ID;
  if(!id||id!==userId||!config.PLATFORM_ADMIN_USER_IDS?.split(',').map(s=>s.trim()).includes(id))return false;
  const expiry=Date.parse(config.PLATFORM_PREVIEW_REVIEW_UNTIL||'');
  return Number.isFinite(expiry)&&expiry>now&&expiry<=now+24*60*60*1000;
}
export function previewReviewPermissions(permissions:PlatformPermission[]):PlatformPermission[]{
  return permissions.filter(p=>p.endsWith('.read'));
}
