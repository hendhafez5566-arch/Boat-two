import {BadRequestException,Injectable,OnModuleDestroy,OnModuleInit} from '@nestjs/common';
import {DatabaseService} from '../database/database.service';
import {ChannelsService} from '../messaging/channels.service';
import {ExternalEffects} from '../events/external-effect';
import {GRAPH,graphPost,ProviderError} from '../messaging/adapters/adapter';
import {env} from '../config/env';
import {socialSchema} from './contracts';
import {z} from 'zod';
class MediaNotReady extends Error {}
@Injectable()
export class SocialService implements OnModuleInit,OnModuleDestroy {
 private timer?:NodeJS.Timeout;private running=false;
 constructor(private db:DatabaseService,private channels:ChannelsService,private effects:ExternalEffects){}
 list(tenant:string){return this.db.withTenant(tenant,async c=>(await c.query('SELECT p.*,ch.name AS channel_name,ch.type AS channel_type FROM social_posts p JOIN channels ch ON ch.id=p.channel_id ORDER BY p.created_at DESC LIMIT 200')).rows);}
 save(tenant:string,input:z.infer<typeof socialSchema>,id?:string){return this.db.withTenant(tenant,async c=>{const channel=(await c.query("SELECT type FROM channels WHERE id=$1 AND type IN('facebook','instagram')",[input.channelId])).rows[0];if(!channel)throw new BadRequestException('Choose a Facebook page or Instagram professional account');if(channel.type==='instagram'&&['text','cta'].includes(input.kind))throw new BadRequestException('Instagram publishing requires image, video or carousel');if(id){const r=await c.query("UPDATE social_posts SET channel_id=$2,kind=$3,body=$4,media_urls=$5,link_url=$6,updated_at=now() WHERE id=$1 AND status='draft' RETURNING *",[id,input.channelId,input.kind,input.body,JSON.stringify(input.mediaUrls),input.linkUrl??null]);if(!r.rowCount)throw new BadRequestException('Only a draft can be edited');return r.rows[0];}return(await c.query('INSERT INTO social_posts(tenant_id,channel_id,kind,body,media_urls,link_url) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[tenant,input.channelId,input.kind,input.body,JSON.stringify(input.mediaUrls),input.linkUrl??null])).rows[0];});}
 async preview(tenant:string,id:string){const post=await this.db.withTenant(tenant,async c=>(await c.query('SELECT p.*,ch.type FROM social_posts p JOIN channels ch ON ch.id=p.channel_id WHERE p.id=$1',[id])).rows[0]);if(!post)throw new BadRequestException('Post not found');return{mock:true,published:false,provider:post.type,kind:post.kind,body:post.body,media:post.media_urls,link:post.link_url,steps:post.type==='instagram'?['Create media container(s)','Publish container']:post.kind==='carousel'?['Upload unpublished media','Create attached-media post']:['Create page post']};}
 async queue(tenant:string,id:string,scheduledAt:string){if(env.EXTERNAL_DELIVERY_ENABLED!=='true')throw new BadRequestException('External publishing disabled by operator');return this.db.withTenant(tenant,async c=>{const r=await c.query("UPDATE social_posts SET status='scheduled',scheduled_at=$2,updated_at=now() WHERE id=$1 AND status='draft' RETURNING id,status,scheduled_at",[id,scheduledAt]);if(!r.rowCount)throw new BadRequestException('Only a draft can be queued');return r.rows[0];});}
 async retry(tenant:string,id:string){return this.db.withTenant(tenant,async c=>{const p=(await c.query("SELECT * FROM social_posts WHERE id=$1 AND status IN('failed','ambiguous')",[id])).rows[0];if(!p)throw new BadRequestException('Only a failed or reconciled ambiguous post can be copied');return this.save(tenant,{channelId:p.channel_id,kind:p.kind,body:p.body,mediaUrls:p.media_urls,linkUrl:p.link_url??undefined});});}
 onModuleInit(){if(process.env.NODE_ENV!=='test'){this.timer=setInterval(()=>void this.tick().catch(()=>undefined),5000);this.timer.unref();}}
 onModuleDestroy(){if(this.timer)clearInterval(this.timer);}
 async tick(){if(this.running||env.EXTERNAL_DELIVERY_ENABLED!=='true')return;this.running=true;try{const jobs=await this.db.query('SELECT * FROM social_post_due(10)');for(const job of jobs.rows){
 const post=await this.db.withTenant(job.tenant_id,async c=>{const p=(await c.query('SELECT p.*,ch.type,ch.external_id,ch.credentials_enc,ch.status AS channel_status FROM social_posts p JOIN channels ch ON ch.id=p.channel_id WHERE p.id=$1 FOR UPDATE OF p SKIP LOCKED',[job.id])).rows[0];if(!p)return null;if(p.status==='sending'){if(new Date(p.lease_until)>new Date())return null;await c.query("UPDATE social_posts SET status='ambiguous',error='Send lease expired; reconcile provider before retry',updated_at=now() WHERE id=$1",[p.id]);return null;}if(p.status!=='scheduled')return null;if(p.channel_status!=='active'){await c.query("UPDATE social_posts SET status='failed',error='Channel disabled',updated_at=now() WHERE id=$1",[p.id]);return null;}await c.query("UPDATE social_posts SET status='sending',lease_until=now()+interval '5 minutes',updated_at=now() WHERE id=$1",[p.id]);return p;});if(!post)continue;
 try{const credentials=this.channels.credentials(post);const token=credentials.pageAccessToken;const base=post.external_id;const request=(path:string,body:unknown)=>this.effects.execute(job.tenant_id,{path,body},()=>graphPost(`${GRAPH}/${path}`,token,body));let published:Record<string,unknown>;
 published=await this.db.eventScope('social:'+post.id,async()=>{
  if(post.type==='instagram'){
   const urls:string[]=post.media_urls;let container:Record<string,unknown>;
   if(post.kind==='carousel'){const children:string[]=[];for(const url of urls){const child=await request(`${base}/media`,{image_url:url,is_carousel_item:true});children.push(String(child.id));}container=await request(`${base}/media`,{media_type:'CAROUSEL',children:children.join(','),caption:post.body});}
   else container=await request(`${base}/media`,post.kind==='video'?{media_type:'REELS',video_url:urls[0],caption:post.body}:{image_url:urls[0],caption:post.body});
   if(!container.id)throw new Error('Provider returned no media container');
   const readiness=await fetch(`${GRAPH}/${container.id}?fields=status_code`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});if(!readiness.ok)throw new ProviderError('Cannot verify media readiness',readiness.status);const state=await readiness.json() as {status_code?:string};if(state.status_code==='IN_PROGRESS')throw new MediaNotReady();if(state.status_code&&state.status_code!=='FINISHED')throw new ProviderError('Media processing failed',400);
   return request(`${base}/media_publish`,{creation_id:container.id});
  }
  if(post.kind==='image')return request(`${base}/photos`,{url:post.media_urls[0],caption:post.body});
  if(post.kind==='video')return request(`${base}/videos`,{file_url:post.media_urls[0],description:post.body});
  if(post.kind==='carousel'){const attached=[];for(const url of post.media_urls){const image=await request(`${base}/photos`,{url,published:false});attached.push({media_fbid:image.id});}return request(`${base}/feed`,{message:post.body,attached_media:attached});}
  return request(`${base}/feed`,{message:post.body,...(post.link_url?{link:post.link_url,...(post.kind==='cta'?{call_to_action:{type:'LEARN_MORE',value:{link:post.link_url}}}:{})}:{})});
 });
 if(!published.id)throw new Error('Provider returned no published post ID');await this.db.withTenant(job.tenant_id,c=>c.query("UPDATE social_posts SET status='published',provider_id=$2,error=NULL,lease_until=NULL,updated_at=now() WHERE id=$1",[post.id,String(published.id)]));
 }catch(e){if(e instanceof MediaNotReady){await this.db.withTenant(job.tenant_id,c=>c.query("UPDATE social_posts SET status='scheduled',scheduled_at=now()+interval '30 seconds',lease_until=NULL,updated_at=now() WHERE id=$1",[post.id]));continue;}await this.db.withTenant(job.tenant_id,c=>c.query('UPDATE social_posts SET status=$2,error=$3,lease_until=NULL,updated_at=now() WHERE id=$1',[post.id,e instanceof ProviderError&&e.status<500?'failed':'ambiguous',e instanceof ProviderError?`Provider rejected request (${e.status}); review permissions or processing readiness`:'Outcome unknown; reconcile with provider before retry']));}
 }}finally{this.running=false;}}
}
