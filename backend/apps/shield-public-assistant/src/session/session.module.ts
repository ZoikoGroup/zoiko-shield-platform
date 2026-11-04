import { Module } from '@nestjs/common';
import { AssistantConfigModule } from '../config/config.module';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';

@Module({
  imports: [AssistantConfigModule],
  controllers: [SessionController],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
