import { Logger, type Provider } from '@nestjs/common';
import { CloudHsmSignerService } from './cloud-hsm-signer.service';
import { DevCloudHsmSignerService } from './dev-cloud-hsm-signer.service';

/**
 * Chooses the HSM command signer by environment, and never silently falls
 * back. Mirrors governedCommandSignerProvider's rule: in production the KMS
 * signer is the only option — if ACTION_HSM_COMMAND_KMS_KEY_VERSION is unset
 * it throws at boot, rather than quietly signing with a throwaway key.
 */
export function createCloudHsmSigner():
  CloudHsmSignerService | DevCloudHsmSignerService {
  const logger = new Logger('CloudHsmSigner');
  if (process.env.NODE_ENV === 'production') {
    logger.log(
      'Signing HSM-identity commands with the Cloud KMS key in custody.',
    );
    return new CloudHsmSignerService();
  }
  // A KMS key id outside production is honoured, so staging can exercise the
  // real custody path before production depends on it.
  if (process.env.ACTION_HSM_COMMAND_KMS_KEY_VERSION?.trim()) {
    logger.log(
      'ACTION_HSM_COMMAND_KMS_KEY_VERSION is set outside production — using the KMS signer.',
    );
    return new CloudHsmSignerService();
  }
  return new DevCloudHsmSignerService();
}

export const cloudHsmSignerProvider: Provider = {
  provide: CloudHsmSignerService,
  useFactory: createCloudHsmSigner,
};
