import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { JourneysController } from './journeys.controller';

@Module({
  imports: [ContentModule],
  controllers: [JourneysController],
})
export class JourneysModule {}
