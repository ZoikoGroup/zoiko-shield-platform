import { Module } from '@nestjs/common';
import { CostRecordController } from './cost-record.controller';
import { CostRecordService } from './cost-record.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CostRecordController],
  providers: [CostRecordService],
  exports: [CostRecordService],
})
export class CostRecordsModule {}
