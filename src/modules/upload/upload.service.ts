import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import OSS = require('ali-oss');
import { AppConfigService } from '../app-config/app-config.service';
import { AttachmentRepo } from '../storage/repos/attachment.repo';

const ACCEPTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const ACCEPTED_BIZ_TYPES = new Set([
  'report_interpret',
  'body_part',
  'ingredient',
  'drug',
]);

type UploadedImageFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Injectable()
export class UploadService {
  private ossClient?: InstanceType<typeof OSS>;

  constructor(
    private readonly attachmentRepo: AttachmentRepo,
    private readonly appConfigService: AppConfigService,
    private readonly configService: ConfigService,
  ) {}

  async uploadImage(file: UploadedImageFile, biz: string, origin?: string) {
    if (!ACCEPTED_BIZ_TYPES.has(biz)) {
      throw new BadRequestException({
        code: 40003,
        message: 'Unsupported biz type',
      });
    }

    if (!ACCEPTED_IMAGE_TYPES.has(file.mimetype)) {
      throw new BadRequestException({
        code: 40003,
        message: 'Unsupported image type',
      });
    }

    const config = this.appConfigService.getConfig();
    const maxBytes = config.limits.image_max_mb * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new BadRequestException({
        code: 40003,
        message: `Image exceeds limit of ${config.limits.image_max_mb}MB`,
      });
    }

    const fileExt = this.resolveFileExtension(file.originalname, file.mimetype);
    const storedFileName = `${Date.now()}-${randomUUID()}${fileExt}`;
    const storageKey = `uploads/${biz}/${storedFileName}`;
    const client = this.getOssClient();

    try {
      await client.put(storageKey, file.buffer, {
        headers: {
          'Content-Type': file.mimetype,
        },
      });
    } catch (error) {
      console.error('[UploadService] OSS upload failed:', error);
      throw new InternalServerErrorException({
        code: 50003,
        message: 'Failed to upload image to OSS',
      });
    }

    const publicUrl = this.buildPublicUrl(storageKey, origin);
    const attachment = await this.attachmentRepo.createUploadedImage({
      userId: 'mock_user_001',
      bizType: biz,
      fileName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      storageKey,
      publicUrl,
    });

    return {
      file_id: attachment.attachment_id,
      url: attachment.public_url,
      size: attachment.size_bytes,
    };
  }

  private getOssClient() {
    if (this.ossClient) {
      return this.ossClient;
    }

    const endpoint = this.normalizeEndpoint(
      this.configService.get<string>('OSS_ENDPOINT'),
    );
    const bucket = this.configService.get<string>('OSS_BUCKET');
    const accessKeyId = this.configService.get<string>('OSS_ACCESS_KEY_ID');
    const accessKeySecret = this.configService.get<string>(
      'OSS_ACCESS_KEY_SECRET',
    );

    if (!endpoint || !bucket || !accessKeyId || !accessKeySecret) {
      throw new InternalServerErrorException({
        code: 50003,
        message: 'OSS configuration is incomplete',
      });
    }

    this.ossClient = new OSS({
      endpoint,
      bucket,
      accessKeyId,
      accessKeySecret,
      secure: true,
      timeout: '60s',
    });

    return this.ossClient;
  }

  private normalizeEndpoint(endpoint?: string) {
    if (!endpoint) {
      return '';
    }

    if (/^https?:\/\//i.test(endpoint)) {
      return endpoint;
    }

    return `https://${endpoint}`;
  }

  private buildOssPublicUrl(storageKey: string, origin?: string) {
    const endpoint = this.configService.get<string>('OSS_ENDPOINT');
    const bucket = this.configService.get<string>('OSS_BUCKET');

    if (endpoint && bucket) {
      return `https://${bucket}.${endpoint}/${storageKey}`;
    }

    return origin ? `${origin}/${storageKey}` : storageKey;
  }

  private buildPublicUrl(storageKey: string, origin?: string) {
    const configuredBaseUrl = this.configService.get<string>('PUBLIC_BASE_URL');
    if (configuredBaseUrl?.trim()) {
      const baseUrl = configuredBaseUrl.trim().replace(/\/+$/, '');
      const objectKey = storageKey.replace(/^\/+/, '');
      return `${baseUrl}/${objectKey}`;
    }

    return this.buildOssPublicUrl(storageKey, origin);
  }

  private resolveFileExtension(originalName: string, mimeType: string) {
    const originalExt = extname(originalName).toLowerCase();
    if (originalExt) {
      return originalExt;
    }

    switch (mimeType) {
      case 'image/jpeg':
        return '.jpg';
      case 'image/png':
        return '.png';
      case 'image/webp':
        return '.webp';
      default:
        return '';
    }
  }
}
