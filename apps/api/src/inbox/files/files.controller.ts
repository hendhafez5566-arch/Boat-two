import {BadRequestException,ConflictException,Controller,Delete,ForbiddenException,Get,NotFoundException,Param,Post,Req,Res,UploadedFile,UseInterceptors,Body,Query} from '@nestjs/common';
import {FileInterceptor} from '@nestjs/platform-express';
import type {Response} from 'express';
import {AttachmentStorage,AttachmentMissing} from './attachment-store';
import {z} from 'zod';
import {Public,Roles} from '../../auth/decorators';
import {parse} from '../../common/zod';
import {AuthedRequest} from '../../common/types';
import {env} from '../../config/env';
import {DatabaseService} from '../../database/database.service';
import {ALLOWED_MIME,isStoredName,kindFromMime,mimeFromStoredName,newStoredName,sniffMatches} from './storage';
const INLINE=/^(image\/|video\/|audio\/|application\/pdf$)/;
@Controller()
export class FilesController{
 constructor(private readonly db:DatabaseService,private readonly store:AttachmentStorage){}
 @Post('uploads')
 @UseInterceptors(FileInterceptor('file',{limits:{fileSize:10*1024*1024,files:1}}))
 async upload(@Req() req:AuthedRequest,@UploadedFile() file:{originalname:string;mimetype:string;buffer:Buffer;size:number}|undefined){
  if(!file)throw new BadRequestException('file is required');
  if(!ALLOWED_MIME[file.mimetype])throw new BadRequestException('Unsupported file type');
  if(!sniffMatches(file.mimetype,file.buffer))throw new BadRequestException('File content does not match its type');
  const name=newStoredName(file.mimetype)!;
  await this.store.put(name,file.buffer,file.mimetype);
  try{await this.db.withTenant(req.user.tenantId,c=>c.query('INSERT INTO files(tenant_id,name,original_name,mime,size,created_by) VALUES($1,$2,$3,$4,$5,$6)',[req.user.tenantId,name,file.originalname.slice(0,200),file.mimetype,file.size,req.user.userId]));}
  catch(e){await this.store.removeOrphan(name).catch(()=>{});throw e;}
  return {name,url:`${env.PUBLIC_API_URL}/files/${name}`,kind:kindFromMime(file.mimetype),filename:file.originalname.slice(0,200),mime:file.mimetype,size:file.size};
 }
 private valid(name:string){if(!isStoredName(name)||!mimeFromStoredName(name))throw new NotFoundException();}
 @Roles('owner','admin') @Get('uploads')
 list(@Req() req:AuthedRequest,@Query() query:unknown){
  const q=parse(z.object({after:z.string().regex(/^[a-f0-9]{48}\.[a-z0-9]{2,5}$/).optional(),limit:z.coerce.number().int().min(1).max(100).default(50)}),query);
  return this.db.withTenant(req.user.tenantId,async c=>{const r=await c.query('SELECT id,name,original_name,mime,size,created_at,deleted_at,revoked_at FROM files WHERE ($1::text IS NULL OR name>$1) ORDER BY name LIMIT $2',[q.after??null,q.limit+1]);const items=r.rows.slice(0,q.limit);return {items,nextAfter:r.rows.length>q.limit?items.at(-1)?.name:null};});
 }
 @Get('uploads/:name')
 async metadata(@Req() req:AuthedRequest,@Param('name') name:string){
  this.valid(name);return this.db.withTenant(req.user.tenantId,async c=>{const row=(await c.query('SELECT id,name,original_name,mime,size,created_at,created_by,deleted_at,revoked_at FROM files WHERE name=$1',[name])).rows[0];if(!row)throw new NotFoundException();return row;});
 }
 @Get('uploads/:name/content')
 async content(@Req() req:AuthedRequest,@Param('name') name:string,@Res() res:Response){
  const row=await this.metadata(req,name);if(row.deleted_at)throw new NotFoundException();return this.respond(name,res);
 }
 @Roles('owner','admin') @Post('uploads/:name/revoke')
 revoke(@Req() req:AuthedRequest,@Param('name') name:string,@Body() body:unknown){parse(z.object({confirm:z.literal(true)}),body);return this.change(req,name,'revoke');}
 @Roles('owner','admin') @Post('uploads/:name/restore')
 restore(@Req() req:AuthedRequest,@Param('name') name:string){return this.change(req,name,'restore');}
 @Delete('uploads/:name')
 remove(@Req() req:AuthedRequest,@Param('name') name:string){return this.change(req,name,'delete');}
 private async change(req:AuthedRequest,name:string,action:'revoke'|'restore'|'delete'){
  this.valid(name);
  return this.db.withTenant(req.user.tenantId,async c=>{
   // Same tenant lock as outbound publication, followed by the file lock.
   await c.query('SELECT id FROM tenants FOR NO KEY UPDATE');
   const row=(await c.query('SELECT * FROM files WHERE name=$1 FOR UPDATE',[name])).rows[0];if(!row)throw new NotFoundException();
   if(action==='delete'){
    if(!['owner','admin'].includes(req.user.role)&&row.created_by!==req.user.userId)throw new ForbiddenException();
    const refs=await c.query(`SELECT 1 FROM messages WHERE strpos(content::text,$1)>0
     UNION ALL SELECT 1 FROM flows WHERE strpos(draft_graph::text,$1)>0
     UNION ALL SELECT 1 FROM flow_versions WHERE strpos(graph::text,$1)>0
     UNION ALL SELECT 1 FROM catalog_products WHERE strpos(COALESCE(image_url,''),$1)>0 LIMIT 1`,[name]);
    if(refs.rowCount)throw new ConflictException({code:'ATTACHMENT_IN_USE',message:'Referenced attachments cannot be deleted. A manager can explicitly revoke sharing.'});
    await c.query('UPDATE files SET deleted_at=COALESCE(deleted_at,now()) WHERE name=$1',[name]);
   }else if(action==='revoke')await c.query('UPDATE files SET revoked_at=COALESCE(revoked_at,now()) WHERE name=$1',[name]);
   else{
    if(!(await this.store.has(name))){throw new ConflictException({code:'ATTACHMENT_BYTES_MISSING',message:'Attachment bytes are unavailable; restore storage from backup first'});}
    await c.query('UPDATE files SET deleted_at=NULL,revoked_at=NULL WHERE name=$1',[name]);
   }
   await c.query('INSERT INTO audit_logs(tenant_id,actor_id,action,resource_type,resource_id) VALUES($1,$2,$3,$4,$5)',[req.user.tenantId,req.user.userId,'attachment.'+action,'files',row.id]);
   return {name,state:action==='restore'?'active':action==='revoke'?'revoked':'deleted',recoverable:true};
  });
 }
 /** Legacy unpredictable URLs remain valid; their DB lifecycle is now authoritative. */
 @Public() @Get('files/:name')
 async serve(@Param('name') name:string,@Res() res:Response){
  this.valid(name);if(!(await this.db.query('SELECT attachment_is_shared($1) AS allowed',[name])).rows[0]?.allowed)throw new NotFoundException();
  return this.respond(name,res);
 }
 private async respond(name:string,res:Response){
  let buf:Buffer;try{buf=await this.store.get(name);}catch(e){if(e instanceof AttachmentMissing)throw new NotFoundException();throw e;}
  const mime=mimeFromStoredName(name)!;
  res.set({'Content-Type':mime,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Cache-Control':'private, no-store','Content-Disposition':INLINE.test(mime)?'inline':'attachment','Cross-Origin-Resource-Policy':'cross-origin'});res.send(buf);
 }
}
