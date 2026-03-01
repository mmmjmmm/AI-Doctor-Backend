import { Controller, Post, Body } from '@nestjs/common';
import { ShareService } from './share.service';

@Controller('share')
export class ShareController {
  constructor(private readonly shareService: ShareService) {}

  @Post('render_image')
  renderImage(
    @Body()
    body: {
      session_id: string;
      message_ids?: string[];
      style?: string;
      include_qr?: boolean;
    },
  ) {
    return this.shareService.renderImage(body.session_id);
  }
}
