import { Module } from '@nestjs/common';
import { MessagingModule } from '../messaging/messaging.module';
import { AssignmentService } from './assignment.service';
import { CannedRepliesController } from './canned-replies.controller';
import { FilesController } from './files/files.controller';
import { InboxController } from './inbox.controller';
import { RealtimeController } from './realtime/realtime.controller';
import { RealtimeService } from './realtime/realtime.service';

@Module({
  imports: [MessagingModule],
  controllers: [InboxController, CannedRepliesController, RealtimeController, FilesController],
  providers: [AssignmentService, RealtimeService],
  exports: [AssignmentService],
})
export class InboxModule {}
