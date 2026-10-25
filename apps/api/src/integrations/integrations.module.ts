import {Module} from '@nestjs/common';
import {CryptoService} from '../messaging/crypto.service';
import {GoogleService} from './google.service';
import {safeHttpRequest} from '../flows/http-safe';
import {IntegrationsService,INTEGRATION_HTTP} from './integrations.service';
import {IntegrationsController} from './integrations.controller';
@Module({providers:[{provide:INTEGRATION_HTTP,useValue:safeHttpRequest},CryptoService,GoogleService,IntegrationsService],controllers:[IntegrationsController],exports:[GoogleService,IntegrationsService]})
export class IntegrationsModule{}
