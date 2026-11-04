import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { HelpController } from './help.controller';

@Module({
  imports: [ContentModule],
  controllers: [HelpController],
})
export class HelpModule {}
