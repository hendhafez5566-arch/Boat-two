import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
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
