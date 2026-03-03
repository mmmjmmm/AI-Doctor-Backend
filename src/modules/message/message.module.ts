import { Module } from '@nestjs/common';
import { MessageController } from './message.controller';
import { MessageService } from './message.service';
import { LangChainService } from './langchain.service';
import { StorageModule } from '../storage/storage.module';
import { AppConfigModule } from '../app-config/app-config.module';
import { MessageRuntimeRegistry } from './message-runtime.registry';

@Module({
  imports: [StorageModule, AppConfigModule],
  controllers: [MessageController],
  providers: [MessageService, LangChainService, MessageRuntimeRegistry],
})
export class MessageModule {}
