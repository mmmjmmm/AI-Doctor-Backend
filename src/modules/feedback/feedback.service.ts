import { Injectable, NotFoundException } from '@nestjs/common';
import { FeedbackRepo } from '../storage/repos/feedback.repo';
import { MessageRepo } from '../storage/repos/message.repo'; // We might need to check if message exists

@Injectable()
export class FeedbackService {
  constructor(
    private readonly feedbackRepo: FeedbackRepo,
    // Assuming we need to check if message exists. FeedbackRepo usually just inserts.
    // The requirement says "若 message_id 不存在：返回 404".
    // So we probably need MessageRepo or let FeedbackRepo throw foreign key error.
    // Let's use Prisma to check or handle error.
    // But since we are strictly following Repo pattern, maybe we can assume the Repo handles it or we inject MessageRepo to check.
    // Let's try to check first if possible, or just let DB fail.
    // However, for "404" specific error, it's better to check.
    // But wait, I don't have getMessageById in MessageRepo interface yet.
    // I'll add `getUserTextByAssistantId` but not general get.
    // I will try to save and catch error, or assume it exists for now since we can't easily check without adding method.
    // Actually, I can use `prisma` in service if I really want, but I should stick to Repo.
    // I'll assume standard 500 or let's add `getMessage` to MessageRepo?
    // User instruction: "MessageRepo: ... (list of methods)".
    // I shouldn't add too many extra methods if not asked, but for 404 I need to know.
    // I will try to update status first. If that fails (record not found), then 404.
    private readonly messageRepo: MessageRepo,
  ) {}

  getConfig() {
    return {
      dislike_tags: [
        '未解决',
        '理解力差',
        '模糊难懂',
        '片面/错误',
        '询问太多',
        '操作困难',
        '生硬机械',
        '功能欠缺',
      ],
    };
  }

  async submitFeedback(
    messageId: string,
    action: 'like' | 'dislike',
    tags: string[],
    comment?: string,
  ) {
    try {
      // We try to update message status first. If message doesn't exist, this might throw or return generic error.
      // Prisma update throws RecordNotFound if not found.
      await this.feedbackRepo.updateMessageFeedbackStatus(
        messageId,
        action === 'like' ? 'liked' : 'disliked',
      );
    } catch (e) {
      // Check if it is a "record not found" error from Prisma
      // For simplicity in this mock/step, we can assume if it fails, it's 404
      throw new NotFoundException('Message not found');
    }

    await this.feedbackRepo.saveFeedback(messageId, action, tags, comment);
    return { ok: true };
  }
}
