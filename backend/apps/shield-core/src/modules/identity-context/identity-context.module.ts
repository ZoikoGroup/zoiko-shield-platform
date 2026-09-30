import { Module } from '@nestjs/common';
import { CiemLeastPrivilegeService } from './ciem-least-privilege.service';
import { CiemRemediationController } from './ciem-remediation.controller';
import { IdentityAdapterModule } from '../identity-adapter/identity-adapter.module';

@Module({
  imports: [IdentityAdapterModule],
  controllers: [CiemRemediationController],
  providers: [CiemLeastPrivilegeService],
  exports: [CiemLeastPrivilegeService],
})
export class IdentityContextModule {}
