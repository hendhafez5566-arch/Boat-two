import { Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../auth/decorators';
import { AuthedRequest } from '../common/types';
import { parse } from '../common/zod';
import { DatabaseService } from '../database/database.service';

const createSchema = z.object({
  shortcut: z.string().regex(/^[\p{L}\p{N}_-]{1,30}$/u, 'Letters, digits, - and _ only'),
  title: z.string().min(1).max(80),
  content: z.string().min(1).max(4000),
});
const updateSchema = createSchema.partial();

@Controller('canned-replies')
export class CannedRepliesController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  list(@Req() req: AuthedRequest) {
    return this.db.withTenant(req.user.tenantId, async (c) => (await c.query('SELECT id, shortcut, title, content FROM canned_replies ORDER BY shortcut')).rows);
  }

  @Roles('owner', 'admin') @Post()
  async create(@Req() req: AuthedRequest, @Body() body: unknown) {
    const b = parse(createSchema, body);
    try {
      return await this.db.withTenant(req.user.tenantId, async (c) =>
        (
          await c.query(
            'INSERT INTO canned_replies (tenant_id, shortcut, title, content, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id, shortcut, title, content',
            [req.user.tenantId, b.shortcut.toLowerCase(), b.title, b.content, req.user.userId],
          )
        ).rows[0],
      );
    } catch (e) {
      if ((e as { code?: string }).code === '23505') throw new ConflictException('Shortcut already exists');
      throw e;
    }
  }

  @Roles('owner', 'admin') @Patch(':id')
  async update(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const b = parse(updateSchema, body);
    try {
      return await this.db.withTenant(req.user.tenantId, async (c) => {
        const r = await c.query(
          `UPDATE canned_replies SET shortcut = COALESCE($2, shortcut), title = COALESCE($3, title), content = COALESCE($4, content)
           WHERE id = $1 RETURNING id, shortcut, title, content`,
          [id, b.shortcut?.toLowerCase() ?? null, b.title ?? null, b.content ?? null],
        );
        if (!r.rows[0]) throw new NotFoundException('Reply not found');
        return r.rows[0];
      });
    } catch (e) {
      if ((e as { code?: string }).code === '23505') throw new ConflictException('Shortcut already exists');
      throw e;
    }
  }

  @Roles('owner', 'admin') @Delete(':id')
  remove(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(req.user.tenantId, async (c) => {
      const r = await c.query('DELETE FROM canned_replies WHERE id = $1', [id]);
      if (!r.rowCount) throw new NotFoundException('Reply not found');
      return { removed: true };
    });
  }
}
