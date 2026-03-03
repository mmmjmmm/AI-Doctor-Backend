import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

interface CreateUploadedImageInput {
  userId: string;
  bizType: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  publicUrl: string;
}

@Injectable()
export class AttachmentRepo {
  constructor(private readonly prisma: PrismaService) {}

  async createUploadedImage(input: CreateUploadedImageInput) {
    return this.prisma.attachment.create({
      data: {
        user_id: input.userId,
        kind: 'image',
        biz_type: input.bizType,
        file_name: input.fileName,
        mime_type: input.mimeType,
        size_bytes: input.sizeBytes,
        storage_key: input.storageKey,
        public_url: input.publicUrl,
        status: 'ready',
      },
    });
  }

  async findReadyByIds(ids: string[], userId: string) {
    return this.prisma.attachment.findMany({
      where: {
        attachment_id: { in: ids },
        user_id: userId,
        status: 'ready',
        deleted_at: null,
      },
    });
  }

  async findReadyById(id: string, userId: string) {
    return this.prisma.attachment.findFirst({
      where: {
        attachment_id: id,
        user_id: userId,
        status: 'ready',
        deleted_at: null,
      },
    });
  }
}
