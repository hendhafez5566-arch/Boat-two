import {BadRequestException,Body,Controller,Get,Param,ParseUUIDPipe,Patch,Post,Req} from '@nestjs/common';
import {z} from 'zod';
import {Roles} from '../auth/decorators';
import {AuthedRequest} from '../common/types';
import {parse} from '../common/zod';
import {CommerceService} from './commerce.service';
import {SocialService} from './social.service';
import {bookingSchema,productSchema,serviceSchema,socialSchema} from './contracts';
@Controller('commerce') @Roles('owner','admin')
export class CommerceController {
 constructor(private commerce:CommerceService,private social:SocialService){}
 @Get('products') products(@Req()r:AuthedRequest){return this.commerce.products(r.user.tenantId);}
 @Post('products') product(@Req()r:AuthedRequest,@Body()body:unknown){return this.commerce.saveProduct(r.user.tenantId,parse(productSchema,body));}
 @Patch('products/:id') updateProduct(@Req()r:AuthedRequest,@Param('id',ParseUUIDPipe)id:string,@Body()body:unknown){return this.commerce.saveProduct(r.user.tenantId,parse(productSchema,body),id);}
 @Post('products/:id/preview') previewProduct(@Req()r:AuthedRequest,@Param('id',ParseUUIDPipe)id:string){return this.commerce.productContent(r.user.tenantId,id,false).then(content=>({mock:true,sent:false,content}));}
 @Get('services') services(@Req()r:AuthedRequest){return this.commerce.services(r.user.tenantId);}
 @Post('services') service(@Req()r:AuthedRequest,@Body()body:unknown){return this.commerce.saveService(r.user.tenantId,parse(serviceSchema,body));}
 @Get('appointments') appointments(@Req()r:AuthedRequest){return this.commerce.bookings(r.user.tenantId);}
 @Post('appointments') book(@Req()r:AuthedRequest,@Body()body:unknown){return this.commerce.book(r.user.tenantId,parse(bookingSchema,body));}
 @Post('appointments/:id/cancel') cancel(@Req()r:AuthedRequest,@Param('id',ParseUUIDPipe)id:string){return this.commerce.cancel(r.user.tenantId,id);}
 @Post('appointments/:id/calendar') calendar(@Req()r:AuthedRequest,@Param('id',ParseUUIDPipe)id:string,@Body()body:unknown){parse(z.object({confirm:z.literal(true)}),body);return this.commerce.syncCalendar(r.user.tenantId,id);}
 @Get('social') posts(@Req()r:AuthedRequest){return this.social.list(r.user.tenantId);}
 @Post('social') savePost(@Req()r:AuthedRequest,@Body()body:unknown){return this.social.save(r.user.tenantId,parse(socialSchema,body));}
 @Patch('social/:id') editPost(@Req()r:AuthedRequest,@Param('id',ParseUUIDPipe)id:string,@Body()body:unknown){return this.social.save(r.user.tenantId,parse(socialSchema,body),id);}
 @Post('social/:id/preview') preview(@Req()r:AuthedRequest,@Param('id',ParseUUIDPipe)id:string){return this.social.preview(r.user.tenantId,id);}
 @Post('social/:id/queue') queue(@Req()r:AuthedRequest,@Param('id',ParseUUIDPipe)id:string,@Body()body:unknown){const b=parse(z.object({confirm:z.literal(true),scheduledAt:z.string().datetime()}),body);return this.social.queue(r.user.tenantId,id,b.scheduledAt);}
 @Post('social/:id/retry-draft') retry(@Req()r:AuthedRequest,@Param('id',ParseUUIDPipe)id:string,@Body()body:unknown){const b=parse(z.object({reconciled:z.boolean()}),body);if(!b.reconciled)throw new BadRequestException('Reconcile previous outcome first');return this.social.retry(r.user.tenantId,id);}
}
