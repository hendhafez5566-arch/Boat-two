import {BadRequestException,Injectable,NotFoundException,ServiceUnavailableException} from '@nestjs/common';
import {createHash,randomBytes} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import {CryptoService} from '../messaging/crypto.service';
import {env} from '../config/env';
import {GoogleOperation,googleRequest} from './contracts';
const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
class GoogleAuthorizationError extends BadRequestException {}
@Injectable()
export class GoogleService {
 constructor(private db:DatabaseService,private crypto:CryptoService){}
 config(){return{configured:!!env.GOOGLE_CLIENT_ID&&!!env.GOOGLE_CLIENT_SECRET,externalEnabled:env.EXTERNAL_DELIVERY_ENABLED==='true',redirectUri:`${env.PUBLIC_API_URL}/integrations/google/callback`};}
 private ready(){if(!this.config().configured||!this.config().externalEnabled)throw new ServiceUnavailableException('Google OAuth requires operator configuration and explicitly enabled external access');}
 async start(tenant:string,user:string,purposes:string[]){
  this.ready();const scopes=[...new Set(purposes.map(p=>p==='calendar'?'https://www.googleapis.com/auth/calendar.events':p==='sheets_write'?'https://www.googleapis.com/auth/spreadsheets':'https://www.googleapis.com/auth/spreadsheets.readonly'))];
  const state=randomBytes(32).toString('hex');await this.db.withTenant(tenant,c=>c.query('INSERT INTO integration_oauth_states(tenant_id,user_id,state_hash,scopes) VALUES($1,$2,$3,$4)',[tenant,user,hash(state),scopes]));
  const params=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID!,redirect_uri:this.config().redirectUri,response_type:'code',scope:scopes.join(' '),state,access_type:'offline',prompt:'consent',include_granted_scopes:'true'});
  return{authorizeUrl:`https://accounts.google.com/o/oauth2/v2/auth?${params}`};
 }
 async complete(state:string,code:string){
  this.ready();const lookup=(await this.db.query('SELECT * FROM integration_oauth_lookup($1)',[hash(state)])).rows[0];if(!lookup)throw new BadRequestException('OAuth state expired or consumed');
  const input=await this.db.withTenant(lookup.tenant_id,async c=>{const row=(await c.query('SELECT * FROM integration_oauth_states WHERE id=$1 FOR UPDATE',[lookup.id])).rows[0];if(row.consumed||new Date(row.expires_at)<new Date())throw new BadRequestException('OAuth state expired');if(!(await c.query("SELECT 1 FROM memberships WHERE user_id=$1 AND role IN('owner','admin')",[row.user_id])).rowCount)throw new BadRequestException('Membership no longer authorized');await c.query('UPDATE integration_oauth_states SET consumed=true WHERE id=$1',[row.id]);return row;});
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID!,client_secret:env.GOOGLE_CLIENT_SECRET!,code,grant_type:'authorization_code',redirect_uri:this.config().redirectUri}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new BadRequestException('Google rejected authorization code');
  const tokens=await response.json() as Record<string,unknown>;if(typeof tokens.access_token!=='string')throw new BadRequestException('Google returned no access token');
  const scopes=String(tokens.scope??input.scopes.join(' ')).split(' ');const credentials={...tokens,expiresAt:Date.now()+Number(tokens.expires_in??3600)*1000};
  await this.db.withTenant(lookup.tenant_id,c=>c.query("INSERT INTO integration_connections(tenant_id,provider,name,credentials_enc,config,status,enabled) VALUES($1,'google','Google',$2,$3,'connected',true)",[lookup.tenant_id,this.crypto.encrypt(credentials),JSON.stringify({scopes})]));
  return{connected:true};
 }
 async execute(tenant:string,id:string,input:GoogleOperation,dryRun=false){
  const request=googleRequest(input);if(dryRun)return{mock:true,delivered:false,request};
  this.ready();return this.db.withTenant(tenant,async c=>{
   const row=(await c.query("SELECT * FROM integration_connections WHERE id=$1 AND provider='google' AND enabled AND status='connected' FOR UPDATE",[id])).rows[0];if(!row)throw new NotFoundException('Authorized Google account unavailable');
   const scopes:string[]=row.config.scopes??[];if(!scopes.includes(request.scope)&&!(input.operation==='sheet_read'&&scopes.includes('https://www.googleapis.com/auth/spreadsheets')))throw new BadRequestException('Reconnect Google with the required purpose');
   const token=this.crypto.decrypt<Record<string,unknown>>(row.credentials_enc);
   if(Number(token.expiresAt)<Date.now()+60000){
    if(!token.refresh_token)throw new GoogleAuthorizationError('Google authorization expired; reconnect');
    const refreshed=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:String(token.refresh_token),client_id:env.GOOGLE_CLIENT_ID!,client_secret:env.GOOGLE_CLIENT_SECRET!}),signal:AbortSignal.timeout(15000)});
    if(!refreshed.ok){throw new GoogleAuthorizationError('Google refresh failed; reconnect');}
    const next=await refreshed.json() as Record<string,unknown>;Object.assign(token,next,{expiresAt:Date.now()+Number(next.expires_in??3600)*1000});await c.query('UPDATE integration_connections SET credentials_enc=$2,updated_at=now() WHERE id=$1',[id,this.crypto.encrypt(token)]);
   }
   const response=await fetch(request.url,{method:request.method,headers:{Authorization:`Bearer ${token.access_token}`,'Content-Type':'application/json'},...(request.body?{body:JSON.stringify(request.body)}:{}),signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw new BadRequestException(`Google request failed (${response.status})`);return{mock:false,delivered:true,data:await response.json()};
  }).catch(async error=>{if(error instanceof GoogleAuthorizationError)await this.db.withTenant(tenant,c=>c.query("UPDATE integration_connections SET status='needs_action',updated_at=now() WHERE id=$1",[id]));throw error;});
 }
}
