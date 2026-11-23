import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { sniffMatches } from '../inbox/files/storage';
import { conversationOrderSchema, orderSchema, selectionSchema } from './checkout';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  ParseIntPipe,
  Res,
  UploadedFile,
  UseInterceptors,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../auth/decorators';
import { AuthedRequest } from '../common/types';
import { parse } from '../common/zod';
import { CommerceService } from './commerce.service';
import { SocialService } from './social.service';
import {
  bookingSchema,
  categorySchema,
  productSchema,
  serviceSchema,
  socialSchema,
} from './contracts';
@Controller('commerce')
@Roles('owner', 'admin')
export class CommerceController {
  constructor(
    private commerce: CommerceService,
    private social: SocialService,
  ) {}
  @Get('categories') categories(@Req() r: AuthedRequest) {
    return this.commerce.categories(r.user.tenantId);
  }
  @Post('categories') category(@Req() r: AuthedRequest, @Body() body: unknown) {
    const { name, parentId } = parse(categorySchema, body);
    return this.commerce.saveCategory(r.user.tenantId, name, undefined, parentId);
  }
  @Patch('categories/:id') renameCategory(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const { name, parentId } = parse(categorySchema, body);
    return this.commerce.saveCategory(r.user.tenantId, name, id, parentId);
  }
  @Delete('categories/:id') removeCategory(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    parse(z.object({ confirm: z.literal(true) }), body);
    return this.commerce.removeCategory(r.user.tenantId, id);
  }
  @Post('categories/:id/duplicate') duplicateCategory(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.commerce.duplicateCategory(r.user.tenantId, id, parse(categorySchema, body).name);
  }
  @Get('products') products(@Req() r: AuthedRequest) {
    return this.commerce.products(r.user.tenantId);
  }
  @Get('products/scope') productScope(@Req() r: AuthedRequest) {
    return this.commerce.productScope(r.user.tenantId);
  }
  @Get('products/page') productPage(@Req() r: AuthedRequest, @Query() query: unknown) {
    const input = parse(z.object({
      q: z.string().trim().max(120).default(''),
      category: z.union([z.uuid(), z.enum(['all', 'none'])]).default('all'),
      page: z.coerce.number().int().min(1).max(100_000).default(1),
    }), query);
    return this.commerce.productPage(r.user.tenantId, input.category, input.q, input.page);
  }
  @Get('products/:id')
  localProduct(@Req() r: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.commerce.localProduct(r.user.tenantId, id);
  }
  @Post('products') product(@Req() r: AuthedRequest, @Body() body: unknown) {
    return this.commerce.saveProduct(r.user.tenantId, parse(productSchema, body));
  }
  @Patch('products/:id') updateProduct(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.commerce.saveProduct(r.user.tenantId, parse(productSchema, body), id);
  }
  @Delete('products/:id') removeProduct(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    parse(z.object({ confirm: z.literal(true) }), body);
    return this.commerce.removeProduct(r.user.tenantId, id);
  }
  @Post('products/:id/archive') archiveProduct(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    parse(z.object({ confirm: z.literal(true) }), body);
    return this.commerce.archiveProduct(r.user.tenantId, id);
  }
  @Post('products/:id/preview') previewProduct(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.commerce
      .productContent(r.user.tenantId, id, false)
      .then((content) => ({ mock: true, sent: false, content }));
  }
  @Get('checkout/products/:id')
  checkoutProduct(@Req() r: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.commerce.activeCheckoutProduct(r.user.tenantId, id);
  }
  @Post('checkout/quote') quote(@Req() r: AuthedRequest, @Body() body: unknown) {
    return this.commerce.quote(r.user.tenantId, parse(selectionSchema, body));
  }
  @Post('orders') createOrder(@Req() r: AuthedRequest, @Body() body: unknown) {
    return this.commerce.createOrder(r.user.tenantId, r.user.userId, parse(orderSchema, body));
  }
  @Post('orders/from-conversation')
  createConversationOrder(@Req() r: AuthedRequest, @Body() body: unknown) {
    return this.commerce.createConversationOrder(
      r.user.tenantId, r.user.userId, parse(conversationOrderSchema, body),
    );
  }
  @Get('orders') orders(@Req() r: AuthedRequest, @Query() query: unknown) {
    const { page } = parse(z.object({ page: z.coerce.number().int().min(1).max(100000).default(1) }), query);
    return this.commerce.orders(r.user.tenantId, page);
  }
  @Patch('orders/:id/status')
  orderStatus(@Req() r: AuthedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const { status } = parse(z.object({ status: z.enum(['confirmed', 'completed', 'cancelled']) }), body);
    return this.commerce.changeOrderStatus(r.user.tenantId, r.user.userId, id, status);
  }
  @Get('orders/:id/history')
  orderHistory(@Req() r: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.commerce.orderHistory(r.user.tenantId, id);
  }
  @Get('orders/:id/documents')
  documents(@Req() r: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.commerce.orderDocuments(r.user.tenantId, id);
  }
  @Post('orders/:id/documents/:slot')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024, files: 1 } }))
  uploadDocument(
    @Req() r: AuthedRequest, @Param('id', ParseUUIDPipe) id: string, @Param('slot', ParseIntPipe) slot: number,
    @UploadedFile() file?: { originalname: string; mimetype: string; buffer: Buffer },
  ) {
    if (!file || !['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype) ||
        !sniffMatches(file.mimetype, file.buffer))
      throw new BadRequestException('Choose a PDF, JPG, or PNG document');
    return this.commerce.uploadOrderDocument(r.user.tenantId, id, slot, file);
  }
  @Get('orders/:id/documents/:slot')
  async downloadDocument(
    @Req() r: AuthedRequest, @Param('id', ParseUUIDPipe) id: string, @Param('slot', ParseIntPipe) slot: number,
    @Res() response: Response,
  ) {
    const document = await this.commerce.orderDocument(r.user.tenantId, id, slot);
    response.set({
      'Content-Type': document.mime, 'Content-Disposition': 'attachment', 'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox",
    }).send(Buffer.from(document.bytes));
  }
  @Get('services') services(@Req() r: AuthedRequest) {
    return this.commerce.services(r.user.tenantId);
  }
  @Post('services') service(@Req() r: AuthedRequest, @Body() body: unknown) {
    return this.commerce.saveService(r.user.tenantId, parse(serviceSchema, body));
  }
  @Get('appointments') appointments(@Req() r: AuthedRequest) {
    return this.commerce.bookings(r.user.tenantId);
  }
  @Post('appointments') book(@Req() r: AuthedRequest, @Body() body: unknown) {
    return this.commerce.book(r.user.tenantId, parse(bookingSchema, body));
  }
  @Post('appointments/:id/cancel') cancel(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.commerce.cancel(r.user.tenantId, id);
  }
  @Post('appointments/:id/calendar') calendar(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    parse(z.object({ confirm: z.literal(true) }), body);
    return this.commerce.syncCalendar(r.user.tenantId, id);
  }
  @Get('social') posts(@Req() r: AuthedRequest) {
    return this.social.list(r.user.tenantId);
  }
  @Post('social') savePost(@Req() r: AuthedRequest, @Body() body: unknown) {
    return this.social.save(r.user.tenantId, parse(socialSchema, body));
  }
  @Patch('social/:id') editPost(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.social.save(r.user.tenantId, parse(socialSchema, body), id);
  }
  @Post('social/:id/preview') preview(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.social.preview(r.user.tenantId, id);
  }
  @Post('social/:id/queue') queue(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z.object({ confirm: z.literal(true), scheduledAt: z.string().datetime() }),
      body,
    );
    return this.social.queue(r.user.tenantId, id, b.scheduledAt);
  }
  @Post('social/:id/retry-draft') retry(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ reconciled: z.boolean() }), body);
    if (!b.reconciled) throw new BadRequestException('Reconcile previous outcome first');
    return this.social.retry(r.user.tenantId, id);
  }
}
