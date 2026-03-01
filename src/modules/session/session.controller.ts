import { Controller, Post, Body } from '@nestjs/common';
import { SessionService } from './session.service';

@Controller('session')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Post('create')
  createSession(@Body() body: { title?: string; entry_source?: string }) {
    // In a real app, userId would come from auth guard/token
    const userId = 'mock_user_001'; 
    return this.sessionService.createSession(userId, body.title);
  }

  @Post('end')
  endSession(@Body() body: { session_id: string }) {
    return this.sessionService.endSession(body.session_id);
  }
}
