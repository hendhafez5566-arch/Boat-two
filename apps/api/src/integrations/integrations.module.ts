import {Module} from '@nestjs/common';
import {CryptoService} from '../messaging/crypto.service';
import {GoogleService} from './google.service';
import {IntegrationsService} from './integrations.service';
import {IntegrationsController} from './integrations.controller';
@Module({providers:[CryptoService,GoogleService,IntegrationsService],controllers:[IntegrationsController],exports:[GoogleService,IntegrationsService]})
export class IntegrationsModule{}
