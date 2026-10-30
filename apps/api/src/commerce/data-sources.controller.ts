import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Workbook } from 'exceljs';
import { z } from 'zod';
import { Roles } from '../auth/decorators';
import { AuthedRequest } from '../common/types';
import { parse } from '../common/zod';
import { parseCsv } from '../flows/engine/sheet';
import { DataSourcesService } from './data-sources.service';
import { sourceSchema } from './data-contracts';
const rowsSchema = z.array(z.array(z.string().max(4000)).max(100)).max(10001);
@Controller('commerce/sources')
@Roles('owner', 'admin')
export class DataSourcesController {
  constructor(private sources: DataSourcesService) {}
  @Get() list(@Req() r: AuthedRequest) {
    return this.sources.list(r.user.tenantId);
  }
  @Post() save(@Req() r: AuthedRequest, @Body() b: unknown) {
    return this.sources.save(r.user.tenantId, parse(sourceSchema, b));
  }
  @Patch(':id') update(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: unknown,
  ) {
    return this.sources.save(r.user.tenantId, parse(sourceSchema, b), id);
  }
  @Post('file-preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  async file(@UploadedFile() file: Express.Multer.File, @Body('sheet') sheet?: string) {
    if (!file) throw new BadRequestException('Choose an .xlsx or .csv file (maximum 5 MB)');
    let rows: string[][], sheets: string[];
    if (/\.csv$/i.test(file.originalname)) {
      if (file.buffer.includes(0)) throw new BadRequestException('Use UTF-8 CSV');
      const csv = file.buffer.toString('utf8');
      let quoted = false;
      for (let i = 0; i < csv.length; i++) {
        if (csv[i] === '"') {
          if (quoted && csv[i + 1] === '"') i++;
          else quoted = !quoted;
        }
      }
      if (quoted) throw new BadRequestException('CSV contains an incomplete quoted field');
      rows = parseCsv(csv);
      sheets = ['CSV'];
    } else if (/\.xlsx$/i.test(file.originalname)) {
      try {
        let expanded = 0,
          entries = 0;
        for (let i = 0; i + 46 < file.buffer.length; i++) {
          if (file.buffer.readUInt32LE(i) === 0x02014b50) {
            expanded += file.buffer.readUInt32LE(i + 24);
            entries++;
            if (expanded > 25 * 1024 * 1024 || entries > 500)
              throw new Error('Workbook expands beyond the safe size limit');
            i +=
              45 +
              file.buffer.readUInt16LE(i + 28) +
              file.buffer.readUInt16LE(i + 30) +
              file.buffer.readUInt16LE(i + 32);
          }
        }
        if (!entries) throw new Error('Invalid XLSX archive');
        const workbook = new Workbook();
        await workbook.xlsx.load(file.buffer as never);
        sheets = workbook.worksheets.map((w) => w.name);
        const ws = sheet ? workbook.getWorksheet(sheet) : workbook.worksheets[0];
        if (!ws) throw new Error('Choose a worksheet');
        if (ws.rowCount > 10001 || ws.columnCount > 100)
          throw new Error('File exceeds 10000 rows / 100 columns');
        rows = [];
        ws.eachRow({ includeEmpty: true }, (row) => {
          const cells: string[] = [];
          for (let i = 1; i <= ws.columnCount; i++) {
            const cell = row.getCell(i);
            if (cell.type === 6)
              throw new Error('Formula cells are not imported; replace formulas with values');
            cells.push(cell.text);
          }
          rows.push(cells);
        });
      } catch (e) {
        throw new BadRequestException('Cannot import workbook: ' + (e as Error).message);
      }
    } else throw new BadRequestException('Only .xlsx and .csv files are supported');
    if (
      !rows.length ||
      rows.length > 10001 ||
      rows.some((r) => r.length > 100 || r.some((c) => c.length > 4000))
    )
      throw new BadRequestException('Invalid file size or data');
    return { sheets, rows: rowsSchema.parse(rows) };
  }
  @Post(':id/file-preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  async stageFile(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('sheet') sheet?: string,
  ) {
    const v = await this.file(file, sheet);
    return this.sources.preview(r.user.tenantId, id, v.rows);
  }
  @Post(':id/preview') preview(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: unknown,
  ) {
    const v = parse(z.object({ rows: rowsSchema.optional() }), b);
    return this.sources.preview(r.user.tenantId, id, v.rows);
  }
  @Post(':id/apply') apply(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: unknown,
  ) {
    const v = parse(
      z.object({ previewId: z.string().uuid(), archiveMissing: z.boolean().default(false) }),
      b,
    );
    return this.sources.apply(r.user.tenantId, id, v.previewId, v.archiveMissing);
  }
  @Get(':id/categories') categories(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.sources.categories(r.user.tenantId, id);
  }
  @Get(':id/items') items(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: unknown,
  ) {
    const v = parse(
      z.object({
        category: z.string().max(300).default(''),
        query: z.string().max(300).default(''),
        page: z.coerce.number().int().min(0).max(1250).default(0),
      }),
      q,
    );
    return this.sources.items(r.user.tenantId, id, v.category, v.query, v.page);
  }
  @Get(':id/runs') runs(@Req() r: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.sources.runs(r.user.tenantId, id);
  }
}
