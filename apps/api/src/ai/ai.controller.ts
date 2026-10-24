import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Patch,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { Roles } from '../auth/decorators';
import { AuthedRequest } from '../common/types';
import { parse } from '../common/zod';
import { AiService } from './ai.service';
import { KnowledgeService } from './knowledge/knowledge.service';

const settingsSchema = z.object({
  enabled: z.boolean().optional(),
  auto_reply: z.boolean().optional(),
  business_name: z.string().max(120).nullable().optional(),
  instructions: z.string().max(4000).nullable().optional(),
  tone: z.enum(['friendly', 'professional', 'concise']).optional(),
  language: z.enum(['auto', 'ar', 'en']).optional(),
  handoff_enabled: z.boolean().optional(),
  fallback_message: z.string().min(1).max(500).optional(),
  handoff_message: z.string().min(1).max(500).optional(),
  max_history: z.number().int().min(2).max(30).optional(),
  temperature: z.number().min(0).max(1).optional(),
});
const askSchema = z.object({ question: z.string().min(1).max(1000) });

const sourceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    title: z.string().min(1).max(200),
    content: z.string().min(1).max(300_000),
  }),
  z.object({
    type: z.literal('faq'),
    title: z.string().min(1).max(200),
    items: z
      .array(
        z.object({ question: z.string().min(1).max(500), answer: z.string().min(1).max(2500) }),
      )
      .min(1)
      .max(300),
  }),
  z.object({
    type: z.literal('url'),
    url: z.string().url().max(2000),
    title: z.string().max(200).optional(),
  }),
]);

@Controller('ai')
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly knowledge: KnowledgeService,
  ) {}

  @Get('status')
  async status(@Req() req: AuthedRequest) {
    return {
      ...(await this.ai.configuration(req.user.tenantId)),
      embeddingsConfigured: this.knowledge.configured,
    };
  }

  @Get('settings')
  settings(@Req() req: AuthedRequest) {
    return this.ai.getSettings(req.user.tenantId);
  }

  @Roles('owner', 'admin')
  @Put('settings')
  save(@Req() req: AuthedRequest, @Body() body: unknown) {
    return this.ai.saveSettings(req.user.tenantId, parse(settingsSchema, body));
  }

  @Get('usage')
  usage(@Req() req: AuthedRequest) {
    return this.ai.usage(req.user.tenantId);
  }

  @Roles('owner', 'admin')
  @Post('test')
  test(@Req() req: AuthedRequest, @Body() body: unknown) {
    return this.ai.playground(req.user.tenantId, parse(askSchema, body).question);
  }

  // ---------------------------------------------------------------- knowledge

  @Get('knowledge')
  list(@Req() req: AuthedRequest) {
    return this.knowledge.list(req.user.tenantId);
  }

  @Roles('owner', 'admin')
  @Post('knowledge')
  create(@Req() req: AuthedRequest, @Body() body: unknown) {
    return this.knowledge.create(req.user.tenantId, req.user.userId, parse(sourceSchema, body));
  }

  @Roles('owner', 'admin')
  @Post('knowledge/upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  upload(
    @Req() req: AuthedRequest,
    @UploadedFile() file: { originalname: string; mimetype: string; buffer: Buffer } | undefined,
    @Body('title') title?: string,
  ) {
    if (!file) throw new BadRequestException('file is required');
    return this.knowledge.createFromFile(req.user.tenantId, req.user.userId, {
      name: file.originalname,
      mime: file.mimetype,
      buf: file.buffer,
      title,
    });
  }

  @Roles('owner', 'admin')
  @Post('knowledge/:id/replace-file')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  replaceFile(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: { originalname: string; mimetype: string; buffer: Buffer } | undefined,
    @Body() body: unknown,
  ) {
    if (!file) throw new BadRequestException('file is required');
    const b = parse(
      z.object({
        expectedRevision: z.coerce.number().int().min(1),
        title: z.string().trim().max(200).optional(),
      }),
      body,
    );
    return this.knowledge.replaceFile(r.user.tenantId, r.user.userId, id, b.expectedRevision, {
      name: file.originalname,
      mime: file.mimetype,
      buf: file.buffer,
      title: b.title,
    });
  }
  @Roles('owner', 'admin') @Get('knowledge/:id/extractions') extractions(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.knowledge.extractions(r.user.tenantId, id);
  }
  @Roles('owner', 'admin') @Get('knowledge/:id/extractions/:extractionId') extraction(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('extractionId', ParseUUIDPipe) extractionId: string,
  ) {
    return this.knowledge.extractions(r.user.tenantId, id, extractionId);
  }

  @Roles('owner', 'admin')
  @Post('knowledge/search')
  search(@Req() req: AuthedRequest, @Body() body: unknown) {
    return this.knowledge.search(req.user.tenantId, parse(askSchema, body).question, 6);
  }

  @Roles('owner', 'admin') @Get('knowledge/:id/edit') editDetails(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.knowledge.editDetails(r.user.tenantId, id);
  }
  @Roles('owner', 'admin') @Get('knowledge/:id/revisions/:revision') revision(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('revision') revision: string,
  ) {
    const n = parse(z.coerce.number().int().min(1).max(100000), revision);
    return this.knowledge.revisionDetails(r.user.tenantId, id, n);
  }
  @Roles('owner', 'admin') @Patch('knowledge/:id') updateSource(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      sourceSchema.and(z.object({ expectedRevision: z.number().int().min(1) })),
      body,
    );
    return this.knowledge.update(r.user.tenantId, r.user.userId, id, b, b.expectedRevision);
  }
  @Roles('owner', 'admin') @Patch('knowledge/:id/archive') archiveSource(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.knowledge.archive(
      r.user.tenantId,
      id,
      parse(z.object({ archived: z.boolean() }), body).archived,
    );
  }

  @Get('knowledge/:id')
  get(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.knowledge.get(req.user.tenantId, id);
  }

  @Roles('owner', 'admin')
  @Post('knowledge/:id/reindex')
  reindex(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.knowledge.reindex(req.user.tenantId, id);
  }

  @Roles('owner', 'admin')
  @Delete('knowledge/:id')
  remove(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.knowledge.remove(req.user.tenantId, id);
  }
}
