import { Injectable } from '@nestjs/common';

@Injectable()
export class ShareService {
  renderImage(sessionId: string) {
    // Mock response
    return {
      share_id: `share_${Date.now()}`,
      image_url: 'https://placehold.co/600x1200/png?text=Share+Image',
      expires_in: 86400,
    };
  }
}
