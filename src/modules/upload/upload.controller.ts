import {
  BadRequestException,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { UploadService } from './upload.service';

type UploadedImageFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('image')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @UploadedFile() file?: UploadedImageFile,
    @Body('biz') biz?: string,
    @Req() req?: Request,
  ) {
    if (!file) {
      throw new BadRequestException({
        code: 40003,
        message: 'Image file is required',
      });
    }

    if (!biz) {
      throw new BadRequestException({
        code: 40003,
        message: 'biz is required',
      });
    }

    const origin = req ? `${req.protocol}://${req.get('host')}` : undefined;
    return this.uploadService.uploadImage(file, biz, origin);
  }
}
