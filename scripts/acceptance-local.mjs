/** Acceptance fixtures must never target a customer's environment. */
export function assertLocalAcceptance(){
 if(process.env.BOAT_PREVIEW_ONLY!=='true'||process.env.EXTERNAL_DELIVERY_ENABLED!=='false')throw Error('Explicit local preview and disabled external delivery required');
 const local=['localhost','127.0.0.1','[::1]'];
 for(const value of [process.env.SMOKE_API_URL||'http://localhost:4000',process.env.SMOKE_WEB_URL||'http://localhost:3000',process.env.DATABASE_URL,process.env.DATABASE_ADMIN_URL].filter(Boolean))if(!local.includes(new URL(value).hostname))throw Error('Acceptance is restricted to localhost services');
}
