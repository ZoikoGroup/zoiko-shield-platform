import { Module } from '@nestjs/common';
import { VerifiableCredentialService } from './verifiable-credential.service';

@Module({
  providers: [VerifiableCredentialService],
  exports: [VerifiableCredentialService],
})
export class VerifiableCredentialsModule {}
