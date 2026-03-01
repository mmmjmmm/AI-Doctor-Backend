import { Module } from '@nestjs/common';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';
import { StorageModule } from '../storage/storage.module';
import { AppConfigModule } from '../app-config/app-config.module';

@Module({
  imports: [StorageModule, AppConfigModule],
  controllers: [SessionController],
  providers: [SessionService],
})
export class SessionModule {}
