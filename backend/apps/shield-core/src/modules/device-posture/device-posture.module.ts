import { Module } from '@nestjs/common';
import { DevicePostureAttestationService } from './device-posture-attestation.service';

@Module({
  providers: [DevicePostureAttestationService],
  exports: [DevicePostureAttestationService],
})
export class DevicePostureModule {}
