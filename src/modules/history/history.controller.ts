import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { HistoryService } from './history.service';

@Controller('history')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  @Get('list')
  listSessions(
    @Query('days') days?: number,
    @Query('limit') limit?: number,
    @Query('cursor') cursor?: string,
  ) {
    // In a real app, userId would come from auth
    const userId = 'mock_user_001';
    return this.historyService.listSessions(userId, days, limit, cursor);
  }

  @Get('detail')
  getSessionDetail(@Query('session_id') sessionId: string) {
    return this.historyService.getSessionDetail(sessionId);
  }

  @Post('delete')
  deleteSession(@Body() body: { session_id: string }) {
    return this.historyService.deleteSession(body.session_id);
  }

  @Post('batch_delete')
  batchDeleteSessions(@Body() body: { session_ids: string[]; mode: string }) {
    return this.historyService.batchDeleteSessions(body.session_ids);
  }
}
