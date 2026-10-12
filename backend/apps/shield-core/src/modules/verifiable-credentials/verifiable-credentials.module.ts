import { Module } from '@nestjs/common';
import { VerifiableCredentialService } from './verifiable-credential.service';
import { VerifiableCredentialController } from './verifiable-credential.controller';

@Module({
  controllers: [VerifiableCredentialController],
  providers: [VerifiableCredentialService],
  exports: [VerifiableCredentialService],
})
export class VerifiableCredentialsModule {}
