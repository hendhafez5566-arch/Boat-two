import { Module } from '@nestjs/common';
import { MessagingModule } from '../messaging/messaging.module';
import { PlansModule } from '../plans/plans.module';
import { LabelsController, SequencesController } from './sequences.controller';
import { SequencesService } from './sequences.service';

@Module({
  imports: [MessagingModule, PlansModule],
  controllers: [SequencesController, LabelsController],
  providers: [SequencesService],
  exports: [SequencesService],
})
export class SequencesModule {}
