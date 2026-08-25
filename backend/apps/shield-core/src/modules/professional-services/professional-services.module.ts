import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { ProfessionalServiceController } from './professional-service.controller';
import { ProfessionalServiceService } from './professional-service.service';

@Module({
  imports: [PrismaModule, ApprovalsModule],
  controllers: [ProfessionalServiceController],
  providers: [ProfessionalServiceService],
  exports: [ProfessionalServiceService],
})
export class ProfessionalServicesModule {}
