import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export interface IFeedbackRepo {
  saveFeedback(
    messageId: string,
    action: 'like' | 'dislike',
    tags: string[],
    comment?: string,
  ): Promise<void>;
  updateMessageFeedbackStatus(
    messageId: string,
    status: 'none' | 'liked' | 'disliked',
  ): Promise<void>;
}

@Injectable()
export class FeedbackRepo implements IFeedbackRepo {
  constructor(private prisma: PrismaService) {}

  async saveFeedback(
    messageId: string,
    action: 'like' | 'dislike',
    tags: string[],
    comment?: string,
  ): Promise<void> {
    await this.prisma.feedback.create({
      data: {
        message_id: messageId,
        action,
        tags: tags as any,
        comment,
      },
    });
  }

  async updateMessageFeedbackStatus(
    messageId: string,
    status: 'none' | 'liked' | 'disliked',
  ): Promise<void> {
    await this.prisma.message.update({
      where: { message_id: messageId },
      data: { feedback_status: status },
    });
  }
}
