import {BadRequestException,Body,Controller,Get,Param,ParseUUIDPipe,Patch,Post,Query,Req,Res} from '@nestjs/common';
import type {Response} from 'express';
import {z} from 'zod';
import {Roles,Public} from '../auth/decorators';
import {AuthedRequest} from '../common/types';
import {parse} from '../common/zod';
import {env} from '../config/env';
import {connectionSchema,EVENT_TYPES,googleOperationSchema} from './contracts';
import {GoogleService} from './google.service';
import {IntegrationsService} from './integrations.service';
@Controller('integrations')
export class IntegrationsController {
 constructor(private integrations:IntegrationsService,private google:GoogleService){}
 @Roles('owner','admin') @Get() list(@Req() r:AuthedRequest){return this.integrations.list(r.user.tenantId);}
 @Roles('owner','admin') @Get('capabilities') capabilities(){return{google:this.google.config(),eventTypes:EVENT_TYPES,externalEnabled:env.EXTERNAL_DELIVERY_ENABLED==='true'};}
 @Roles('owner','admin') @Post() create(@Req() r:AuthedRequest,@Body() body:unknown){return this.integrations.create(r.user.tenantId,parse(connectionSchema,body));}
 @Roles('owner','admin') @Patch(':id') enable(@Req() r:AuthedRequest,@Param('id',ParseUUIDPipe) id:string,@Body() body:unknown){return this.integrations.update(r.user.tenantId,id,parse(z.object({enabled:z.boolean().optional(),config:connectionSchema.shape.config.partial().optional(),credential:z.string().min(1).max(4000).optional(),name:z.string().min(1).max(100).optional()}),body));}
 @Roles('owner','admin') @Post(':id/disconnect') disconnect(@Req() r:AuthedRequest,@Param('id',ParseUUIDPipe) id:string){return this.integrations.disconnect(r.user.tenantId,id);}
 @Roles('owner','admin') @Post('google/start') start(@Req() r:AuthedRequest,@Body() body:unknown){return this.google.start(r.user.tenantId,r.user.userId,parse(z.object({purposes:z.array(z.enum(['sheets_read','sheets_write','calendar','contacts_read'])).min(1).max(4)}),body).purposes);}
 @Public() @Get('google/callback') async callback(@Query() query:unknown,@Res() response:Response){const q=parse(z.object({state:z.string().min(32).max(200),code:z.string().min(1).max(4000)}),query);await this.google.complete(q.state,q.code);response.redirect(env.APP_URL+'/dashboard/integrations?google=connected');}
 @Roles('owner','admin') @Post('google/:id/execute') googleExecute(@Req() r:AuthedRequest,@Param('id',ParseUUIDPipe) id:string,@Body() body:unknown){const b=parse(z.object({input:googleOperationSchema,dryRun:z.boolean().default(true),confirm:z.boolean().default(false)}),body);if(!b.dryRun&&!b.confirm)throw new BadRequestException('Explicit confirmation required');return this.google.execute(r.user.tenantId,id,b.input,b.dryRun);}
 @Roles('owner','admin') @Post(':id/execute') execute(@Req() r:AuthedRequest,@Param('id',ParseUUIDPipe) id:string,@Body() body:unknown){const b=parse(z.object({payload:z.record(z.unknown()),dryRun:z.boolean().default(true),confirm:z.boolean().default(false)}),body);if(!b.dryRun&&!b.confirm)throw new BadRequestException('Explicit confirmation required');return this.integrations.execute(r.user.tenantId,id,b.payload,b.dryRun);}
 @Roles('owner','admin') @Get('deliveries') deliveries(@Req() r:AuthedRequest){return this.integrations.deliveries(r.user.tenantId);}
 @Roles('owner','admin') @Post('deliveries/:id/retry') retry(@Req() r:AuthedRequest,@Param('id',ParseUUIDPipe) id:string,@Body() body:unknown){return this.integrations.retry(r.user.tenantId,id,parse(z.object({reconciled:z.boolean().default(false)}),body).reconciled);}
}
