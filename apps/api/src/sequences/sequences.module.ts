import { SequenceCenterController } from './sequence-center.controller';
import { SequenceCenterService } from './sequence-center.service';
import { Module } from '@nestjs/common';
import { MessagingModule } from '../messaging/messaging.module';
import { PlansModule } from '../plans/plans.module';
import { LabelsController, SequencesController } from './sequences.controller';
import { SequencesService } from './sequences.service';

@Module({
  imports: [MessagingModule, PlansModule],
  controllers: [SequenceCenterController, SequencesController, LabelsController],
  providers: [SequencesService, SequenceCenterService],
  exports: [SequencesService],
})
export class SequencesModule {}
