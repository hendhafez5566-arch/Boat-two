import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, Delete, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../auth/decorators';
import { AuthedRequest } from '../common/types';
import { parse } from '../common/zod';
import { DatabaseService } from '../database/database.service';

@Controller('contact-lists')
@Roles('owner','admin')
export class ContactListsController {
  constructor(private db: DatabaseService) {}
  @Get() list(@Req() r: AuthedRequest) {
    return this.db.withTenant(r.user.tenantId, async c => (await c.query('SELECT l.*, (SELECT count(*)::int FROM contact_list_members m WHERE m.list_id=l.id) AS members FROM contact_lists l ORDER BY name LIMIT 500')).rows);
  }
  @Post() create(@Req() r: AuthedRequest, @Body() body: unknown) {
    const input = parse(z.object({name:z.string().trim().min(1).max(120)}),body);
    return this.db.withTenant(r.user.tenantId, async c => (await c.query('INSERT INTO contact_lists(tenant_id,name) VALUES($1,$2) ON CONFLICT(tenant_id,name) DO UPDATE SET name=EXCLUDED.name RETURNING *',[r.user.tenantId,input.name])).rows[0]);
  }
  @Get(':id/members') members(@Req() r: AuthedRequest, @Param('id',ParseUUIDPipe) id: string) {
    return this.db.withTenant(r.user.tenantId, async c => (await c.query('SELECT ct.id,ct.name,ct.email,ct.phone FROM contact_list_members m JOIN contacts ct ON ct.id=m.contact_id WHERE m.list_id=$1 ORDER BY m.created_at DESC LIMIT 500',[id])).rows);
  }
  @Post(':id/members') add(@Req() r: AuthedRequest, @Param('id',ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input=parse(z.object({contactId:z.string().uuid()}),body);
    return this.db.withTenant(r.user.tenantId, async c => {
      if (!(await c.query('SELECT 1 FROM contact_lists WHERE id=$1',[id])).rowCount || !(await c.query('SELECT 1 FROM contacts WHERE id=$1',[input.contactId])).rowCount) throw new NotFoundException('List or contact not found');
      await c.query('INSERT INTO contact_list_members(tenant_id,list_id,contact_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[r.user.tenantId,id,input.contactId]);
      return { saved:true };
    });
  }
  @Delete(':id/members/:contactId') removeMember(@Req() r: AuthedRequest, @Param('id',ParseUUIDPipe) id:string, @Param('contactId',ParseUUIDPipe) contactId:string) {
    return this.db.withTenant(r.user.tenantId, async c => { await c.query('DELETE FROM contact_list_members WHERE list_id=$1 AND contact_id=$2',[id,contactId]); return {removed:true}; });
  }
}
