import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { SessionRepo } from './repos/session.repo';
import { MessageRepo } from './repos/message.repo';
import { FeedbackRepo } from './repos/feedback.repo';

@Module({
  providers: [PrismaService, SessionRepo, MessageRepo, FeedbackRepo],
  exports: [SessionRepo, MessageRepo, FeedbackRepo],
})
export class StorageModule {}
