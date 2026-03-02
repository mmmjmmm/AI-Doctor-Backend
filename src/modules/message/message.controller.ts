import { Controller, Post, Body, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { MessageService } from './message.service';

@Controller('message')
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @Post('send')
  async sendMessage(
    @Body()
    body: {
      session_id: string;
      client_message_id: string;
      content: string;
      type?: string;
      attachments?: any[];
    },
  ) {
    return this.messageService.sendMessage(
      body.session_id,
      body.client_message_id,
      body.content,
      body.attachments || [],
    );
  }

  @Get('stream')
  async streamMessage(
    @Query('session_id') sessionId: string,
    @Query('message_id') messageId: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    return this.messageService.streamMessage(sessionId, messageId, token, res);
  }
}
