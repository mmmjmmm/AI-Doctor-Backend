import { Injectable } from '@nestjs/common';
import { SessionRepo } from '../storage/repos/session.repo';
import { AppConfigService } from '../app-config/app-config.service';

@Injectable()
export class SessionService {
  constructor(
    private readonly sessionRepo: SessionRepo,
    private readonly appConfigService: AppConfigService,
  ) {}

  async createSession(userId: string, title?: string) {
    const session = await this.sessionRepo.createSession(userId, title);
    const config = this.appConfigService.getConfig();

    const welcomeMessages = [
      {
        message_id: 'msg_welcome',
        session_id: session.session_id,
        role: 'assistant',
        type: 'text',
        content:
          '你好，我是小荷健康推出的 AI 健康咨询助手，可以为你提供全天 24 小时的健康帮助，快来和我对话吧！',
        created_at: new Date().toISOString(),
        status: 'sent',
        content_rich: {
          blocks: [
            {
              type: 'paragraph',
              text: '你好，我是小荷健康推出的 AI 健康咨询助手，可以为你提供全天 24 小时的健康帮助，快来和我对话吧！',
            },
            {
              type: 'list',
              items: ['小肚子胀胀的怎么回事', '便秘怎么快速排便', '最近总是失眠'],
            },
          ],
        },
        disclaimer_bottom: config.disclaimer.bottom_hint,
      },
    ];

    return {
      session,
      welcome_messages: welcomeMessages,
      disclaimer: config.disclaimer,
    };
  }

  async endSession(sessionId: string) {
    await this.sessionRepo.endSession(sessionId);
    return { ok: true };
  }
}
