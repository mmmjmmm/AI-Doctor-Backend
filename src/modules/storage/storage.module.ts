import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { SessionRepo } from './repos/session.repo';
import { MessageRepo } from './repos/message.repo';
import { FeedbackRepo } from './repos/feedback.repo';
import { AttachmentRepo } from './repos/attachment.repo';
import { TaskRepo } from './repos/task.repo';

@Module({
  providers: [PrismaService, SessionRepo, MessageRepo, FeedbackRepo, AttachmentRepo, TaskRepo],
  exports: [SessionRepo, MessageRepo, FeedbackRepo, AttachmentRepo, TaskRepo],
})
export class StorageModule {}
