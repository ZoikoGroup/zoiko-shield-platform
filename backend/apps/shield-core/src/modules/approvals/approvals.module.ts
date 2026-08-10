import { Module } from '@nestjs/common';
import { CommercialApprovalController } from './commercial-approval.controller';
import { CommercialApprovalService } from './commercial-approval.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CommercialApprovalController],
  providers: [CommercialApprovalService],
  exports: [CommercialApprovalService],
})
export class ApprovalsModule {}
