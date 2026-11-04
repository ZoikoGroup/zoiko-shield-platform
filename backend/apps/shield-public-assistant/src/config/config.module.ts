import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { AssistantConfigService } from './assistant-config.service';
import { ConfigController } from './config.controller';

@Module({
  imports: [ContentModule],
  controllers: [ConfigController],
  providers: [AssistantConfigService],
  exports: [AssistantConfigService],
})
export class AssistantConfigModule {}
