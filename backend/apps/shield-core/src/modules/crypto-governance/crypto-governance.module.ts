import { Module } from '@nestjs/common';
import { KeyRotationOrchestratorService } from './key-rotation-orchestrator.service';

@Module({
  providers: [KeyRotationOrchestratorService],
  exports: [KeyRotationOrchestratorService],
})
export class CryptoGovernanceModule {}
