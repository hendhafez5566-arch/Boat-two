import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../auth/decorators';
import { AuthedRequest } from '../common/types';
import { parse } from '../common/zod';
import { DatabaseService } from '../database/database.service';
import { FlowsService } from './flows.service';
import { readSystemActions, SYSTEM_ACTION_KEYS, systemActionsSchema } from './system-actions';

@Controller('channels')
@Roles('owner', 'admin')
export class SystemActionsController {
  constructor(
    private db: DatabaseService,
    private flows: FlowsService,
  ) {}
  @Get(':id/system-actions') get(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.db.withTenant(req.user.tenantId, async (c) => {
      const channel = (await c.query('SELECT settings FROM channels WHERE id=$1', [id])).rows[0];
      if (!channel) throw new NotFoundException('Channel not found');
      return readSystemActions(channel.settings);
    });
  }
  @Put(':id/system-actions') save(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = parse(systemActionsSchema, body);
    return this.db.withTenant(req.user.tenantId, async (c) => {
      const channel = (await c.query('SELECT settings FROM channels WHERE id=$1 FOR UPDATE', [id]))
        .rows[0];
      if (!channel) throw new NotFoundException('Channel not found');
      if (readSystemActions(channel.settings).revision !== input.revision)
        throw new ConflictException('System actions changed. Reload before saving.');
      for (const action of Object.values(input.actions)) {
        if (!action?.flowId) continue;
        const flow = (
          await c.query(
            "SELECT 1 FROM flows f JOIN flow_versions v ON v.id=f.published_version_id WHERE f.id=$1 AND f.status='published' AND (cardinality(v.channel_ids)=0 OR $2=ANY(v.channel_ids))",
            [action.flowId, id],
          )
        ).rowCount;
        if (!flow)
          throw new BadRequestException('Choose a published flow available on this account');
      }
      const next = { ...input, revision: input.revision + 1 };
      await c.query(
        "UPDATE channels SET settings=jsonb_set(COALESCE(settings,'{}'),'{systemActions}',$2::jsonb,true) WHERE id=$1",
        [id, JSON.stringify(next)],
      );
      return next;
    });
  }
  @Post(':id/system-actions/:kind/draft') draft(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('kind') kind: unknown,
    @Body() body: unknown,
  ) {
    const key = parse(z.enum(SYSTEM_ACTION_KEYS), kind);
    const { language } = parse(z.object({ language: z.enum(['ar', 'en']).default('ar') }), body);
    const names = {
      get_started: ['بدء المحادثة', 'Get Started'],
      no_match: ['لا يوجد تطابق', 'No Match'],
      location_reply: ['استلام موقع', 'Location Reply'],
      unsubscribe: ['إلغاء الاشتراك', 'Unsubscribe'],
      resubscribe: ['إعادة الاشتراك', 'Resubscribe'],
      human: ['التحدث لموظف', 'Chat with Human'],
      bot: ['العودة للبوت', 'Chat with Bot'],
    };
    const messages = {
      get_started: ['أهلًا بك، كيف نساعدك؟', 'Welcome! How can we help?'],
      no_match: [
        'لم أفهم طلبك. أعد صياغته من فضلك.',
        'I did not understand. Please rephrase your request.',
      ],
      location_reply: ['وصلنا موقعك.', 'We received your location.'],
      unsubscribe: [
        'تم إلغاء اشتراكك في الرسائل التسويقية.',
        'You have been unsubscribed from marketing messages.',
      ],
      resubscribe: [
        'تم تسجيل طلب إعادة اشتراكك.',
        'Your request to subscribe again has been recorded.',
      ],
      human: ['تم تحويل محادثتك إلى فريق الدعم.', 'Your conversation has been handed to our team.'],
      bot: ['عدت إلى المساعد الآلي. كيف نساعدك؟', 'You are back with the bot. How can we help?'],
    };
    return this.db.withTenant(req.user.tenantId, async (c) => {
      if (!(await c.query('SELECT 1 FROM channels WHERE id=$1', [id])).rowCount)
        throw new NotFoundException('Channel not found');
      const flow = await this.flows.create(req.user.tenantId, req.user.userId, {
        name: names[key][language === 'ar' ? 0 : 1],
        language,
        isComponent: true,
        channelIds: [id],
      });
      await this.flows.update(req.user.tenantId, flow.id, {
        graph: {
          startNodeId: 'start',
          nodes: [
            {
              id: 'start',
              type: 'message',
              position: { x: 80, y: 80 },
              data: { text: messages[key][language === 'ar' ? 0 : 1] },
              edges: {},
            },
          ],
        },
        expectedUpdatedAt: new Date(flow.updated_at).toISOString(),
      });
      return { id: flow.id };
    });
  }
}
