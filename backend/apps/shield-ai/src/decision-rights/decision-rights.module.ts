import { Module } from '@nestjs/common';
import { DecisionRightsService } from './decision-rights.service';
import { DecisionRightsController } from './decision-rights.controller';
import { KafkaModule } from '../kafka/kafka.module';

@Module({
  imports: [KafkaModule],
  controllers: [DecisionRightsController],
  providers: [DecisionRightsService],
  exports: [DecisionRightsService],
})
export class DecisionRightsModule {}
