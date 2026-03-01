import { Module } from '@nestjs/common';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';
import { StorageModule } from '../storage/storage.module';
import { AppConfigModule } from '../app-config/app-config.module';

@Module({
  imports: [StorageModule, AppConfigModule],
  controllers: [HistoryController],
  providers: [HistoryService],
})
export class HistoryModule {}
