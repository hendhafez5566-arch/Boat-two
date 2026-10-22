import { BadRequestException, Controller, Get, NotFoundException, Param, Post, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Public } from '../../auth/decorators';
import { AuthedRequest } from '../../common/types';
import { env } from '../../config/env';
import { DatabaseService } from '../../database/database.service';
import { ALLOWED_MIME, isStoredName, kindFromMime, mimeFromStoredName, newStoredName, sniffMatches } from './storage';

const DIR = resolve(env.UPLOAD_DIR);
const INLINE = /^(image\/|video\/|audio\/|application\/pdf$)/;

@Controller()
export class FilesController {
  constructor(private readonly db: DatabaseService) {}

  /** رفع مرفق للإرسال في محادثة. الرابط العام ضروري لأن واتساب/ماسنجر يجلبان الملف بأنفسهما */
  @Post('uploads')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  async upload(@Req() req: AuthedRequest, @UploadedFile() file: { originalname: string; mimetype: string; buffer: Buffer; size: number } | undefined) {
    if (!file) throw new BadRequestException('file is required');
    if (!ALLOWED_MIME[file.mimetype]) throw new BadRequestException('Unsupported file type');
    if (!sniffMatches(file.mimetype, file.buffer)) throw new BadRequestException('File content does not match its type');
    const name = newStoredName(file.mimetype) as string;

    await mkdir(DIR, { recursive: true });
    await writeFile(join(DIR, name), file.buffer, { flag: 'wx' });
    await this.db.withTenant(req.user.tenantId, (c) =>
      c.query('INSERT INTO files (tenant_id, name, original_name, mime, size, created_by) VALUES ($1, $2, $3, $4, $5, $6)', [
        req.user.tenantId, name, file.originalname.slice(0, 200), file.mimetype, file.size, req.user.userId,
      ]),
    );
    return {
      url: `${env.PUBLIC_API_URL}/files/${name}`,
      kind: kindFromMime(file.mimetype),
      filename: file.originalname.slice(0, 200),
      mime: file.mimetype,
      size: file.size,
    };
  }

  @Public() @Get('files/:name')
  async serve(@Param('name') name: string, @Res() res: Response) {
    const mime = isStoredName(name) ? mimeFromStoredName(name) : null;
    if (!mime) throw new NotFoundException();
    let buf: Buffer;
    try {
      buf = await readFile(join(DIR, name));
    } catch {
      throw new NotFoundException();
    }
    res.set({
      'Content-Type': mime,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'public, max-age=86400',
      'Content-Disposition': INLINE.test(mime) ? 'inline' : 'attachment',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    res.send(buf);
  }
}
