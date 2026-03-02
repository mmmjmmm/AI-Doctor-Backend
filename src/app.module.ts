import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { HealthModule } from './modules/health/health.module';
import { StorageModule } from './modules/storage/storage.module';
import { AppConfigModule } from './modules/app-config/app-config.module';
import { SessionModule } from './modules/session/session.module';
import { HistoryModule } from './modules/history/history.module';
import { FeedbackModule } from './modules/feedback/feedback.module';
import { ShareModule } from './modules/share/share.module';
import { MessageModule } from './modules/message/message.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from './common/interceptors/http-exception.filter';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    HealthModule,
    StorageModule,
    AppConfigModule,
    SessionModule,
    HistoryModule,
    FeedbackModule,
    ShareModule,
    MessageModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
