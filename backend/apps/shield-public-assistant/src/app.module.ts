import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CorrelationMiddleware } from './common/correlation.middleware';
import { AssistantConfigModule } from './config/config.module';
import { ContentModule } from './content/content.module';
import { ConversationModule } from './conversation/conversation.module';
import { FeedbackModule } from './feedback/feedback.module';
import { HelpModule } from './help/help.module';
import { IntakeModule } from './intake/intake.module';
import { JourneysModule } from './journeys/journeys.module';
import { SessionModule } from './session/session.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../.env'] }),
    ContentModule,
    AssistantConfigModule,
    SessionModule,
    ConversationModule,
    HelpModule,
    JourneysModule,
    IntakeModule,
    FeedbackModule,
  ],
})
export class ShieldPublicAssistantModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}
