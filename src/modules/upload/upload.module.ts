import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { StorageModule } from '../storage/storage.module';
import { AppConfigModule } from '../app-config/app-config.module';

@Module({
  imports: [StorageModule, AppConfigModule],
  controllers: [UploadController],
  providers: [UploadService],
})
export class UploadModule {}
