import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { AuthorizationDecisionService } from './authorization-decision.service';

@Module({
  imports: [PrismaModule, AuthorizationModule],
  providers: [AuthorizationDecisionService],
  exports: [AuthorizationDecisionService],
})
export class AuthorizationDecisionModule {}
