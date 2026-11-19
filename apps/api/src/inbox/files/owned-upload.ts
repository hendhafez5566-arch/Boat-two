import {BadRequestException} from '@nestjs/common';
import type {PoolClient} from 'pg';
import {env} from '../../config/env';
import {isStoredName} from './storage';
/** Shared public links are bearer capabilities, but a tenant cannot re-send another tenant's upload. */
export async function assertOwnedUpload(c:PoolClient,url?:string){
 if(!url)return;
 const target=new URL(url),base=new URL(env.PUBLIC_API_URL);
 if(target.origin!==base.origin||!target.pathname.startsWith('/files/'))return;
 const name=target.pathname.slice('/files/'.length);
 if(!isStoredName(name))throw new BadRequestException('Invalid uploaded attachment');
 const r=await c.query('SELECT name FROM files WHERE name=$1 AND deleted_at IS NULL AND revoked_at IS NULL FOR SHARE',[name]);
 if(!r.rowCount)throw new BadRequestException({code:'ATTACHMENT_UNAVAILABLE',message:'Attachment is unavailable in this workspace'});
}
