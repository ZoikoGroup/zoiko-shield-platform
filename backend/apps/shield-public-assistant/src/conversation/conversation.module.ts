import { Module } from '@nestjs/common';
import { AssistantConfigModule } from '../config/config.module';
import { ContentModule } from '../content/content.module';
import { SessionModule } from '../session/session.module';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';
import { LlmService } from './llm.service';

@Module({
  imports: [ContentModule, AssistantConfigModule, SessionModule],
  controllers: [ConversationController],
  providers: [ConversationService, LlmService],
  exports: [ConversationService],
})
export class ConversationModule {}
