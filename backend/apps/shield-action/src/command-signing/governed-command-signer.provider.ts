import { Logger, type Provider } from '@nestjs/common';
import { GOVERNED_COMMAND_SIGNER } from './command-signer.interface';
import { DevGovernedCommandSigner } from './dev-governed-command-signer.service';
import { ProductionGovernedCommandSigner } from './production-governed-command-signer.service';

/**
 * Chooses the signer by environment, and never silently falls back.
 *
 * In production the KMS signer is the only option: if ACTION_COMMAND_KMS_KEY_VERSION
 * is unset it throws at boot. That is deliberate — a service that cannot sign
 * a governed command with a key in custody must not start and quietly sign
 * with a throwaway one instead.
 */
export const governedCommandSignerProvider: Provider = {
  provide: GOVERNED_COMMAND_SIGNER,
  useFactory: () => {
    const logger = new Logger('GovernedCommandSigner');
    if (process.env.NODE_ENV === 'production') {
      logger.log('Signing governed commands with the AWS KMS key in custody.');
      return new ProductionGovernedCommandSigner();
    }
    // A KMS key id outside production is honoured, so staging can exercise the
    // real custody path before production depends on it.
    if (process.env.ACTION_COMMAND_KMS_KEY_VERSION?.trim()) {
      logger.log(
        'ACTION_COMMAND_KMS_KEY_VERSION is set outside production — using the KMS signer.',
      );
      return new ProductionGovernedCommandSigner();
    }
    return new DevGovernedCommandSigner();
  },
};
