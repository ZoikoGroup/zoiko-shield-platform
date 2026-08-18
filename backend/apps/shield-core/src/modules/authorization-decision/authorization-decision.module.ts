import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';

@Module({
  imports: [AuthorizationModule],
  exports: [AuthorizationModule],
})
export class AuthorizationDecisionModule {}
