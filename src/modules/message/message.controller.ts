import { Controller, Post, Body, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { MessageService } from './message.service';
import { SendMessageDto } from './dto/send-message.dto';

@Controller('message')
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @Post('send')
  async sendMessage(@Body() body: SendMessageDto) {
    return this.messageService.sendMessage(body);
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
