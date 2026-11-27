import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Query,
} from '@nestjs/common';
import {z} from 'zod';
import {parse} from '../common/zod';
import { AuthedRequest } from '../common/types';
import { DatabaseService } from '../database/database.service';
@Controller('auth/sessions')
export class SessionsController {
  constructor(private db: DatabaseService) {}
  @Get() async list(@Req() r: AuthedRequest) {
    return (
      await this.db.query(
        'SELECT id,tenant_id,created_at,expires_at,revoked_at,device_label,last_seen_at,(id=$2::uuid) AS is_current FROM refresh_tokens WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',
        [r.user.userId,r.user.sessionId??null],
      )
    ).rows;
  }
  @Get('index') async index(@Req() r:AuthedRequest,@Query() query:unknown){
    const q=parse(z.object({q:z.string().trim().max(200).default(''),status:z.enum(['all','current','active','revoked','expired']).default('all'),page:z.coerce.number().int().min(1).max(100000).default(1),limit:z.coerce.number().int().min(1).max(100).default(25)}),query);
    const params:unknown[]=[r.user.userId,r.user.sessionId??null];
    const clauses=['user_id=$1','($2::uuid IS NULL OR $2::uuid IS NOT NULL)'];
    if(q.status==='current')clauses.push('id=$2::uuid');
    if(q.status==='active')clauses.push('revoked_at IS NULL AND expires_at>now()');
    if(q.status==='revoked')clauses.push('revoked_at IS NOT NULL');
    if(q.status==='expired')clauses.push('revoked_at IS NULL AND expires_at<=now()');
    if(q.q){params.push('%'+q.q.replace(/[\\%_]/g,v=>'\\'+v)+'%');clauses.push("(COALESCE(device_label,'') ILIKE $3 OR id::text ILIKE $3)");}
    const where=' FROM refresh_tokens WHERE '+clauses.join(' AND ');
    const total=Number((await this.db.query('SELECT count(*)::int n'+where,params)).rows[0].n);
    const items=(await this.db.query('SELECT id,tenant_id,created_at,expires_at,revoked_at,device_label,last_seen_at,(id=$2::uuid) AS is_current'+where+' ORDER BY created_at DESC,id LIMIT  async revoke(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (
      !(
        await this.db.query(
          'UPDATE refresh_tokens SET revoked_at=now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL',
          [id, r.user.userId],
        )
      ).rowCount
    )
      throw new NotFoundException();
    return { revoked: true };
  }
}
+(params.length+1)+' OFFSET  async revoke(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (
      !(
        await this.db.query(
          'UPDATE refresh_tokens SET revoked_at=now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL',
          [id, r.user.userId],
        )
      ).rowCount
    )
      throw new NotFoundException();
    return { revoked: true };
  }
}
+(params.length+2),[...params,q.limit,(q.page-1)*q.limit])).rows;
    return {items,total};
  }
  @Post(':id/revoke') async revoke(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (
      !(
        await this.db.query(
          'UPDATE refresh_tokens SET revoked_at=now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL',
          [id, r.user.userId],
        )
      ).rowCount
    )
      throw new NotFoundException();
    return { revoked: true };
  }
}
