import { Controller, Get, Post, Body } from '@nestjs/common';
import { FeedbackService } from './feedback.service';

@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Get('config')
  getConfig() {
    return this.feedbackService.getConfig();
  }

  @Post('submit')
  submitFeedback(
    @Body()
    body: {
      message_id: string;
      action: 'like' | 'dislike';
      tags: string[];
      comment?: string;
    },
  ) {
    return this.feedbackService.submitFeedback(
      body.message_id,
      body.action,
      body.tags,
      body.comment,
    );
  }
}
