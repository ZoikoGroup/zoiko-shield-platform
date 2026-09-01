import 'dotenv/config';
import { randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../apps/shield-core/src/modules/identity-adapter/mail.service';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function usage(): string {
  return [
    'Usage:',
    '  npm run test:invitation-email -- <recipient-email> [tenant-name]',
    '',
    'Example:',
    '  npm run test:invitation-email -- owner@example.com "Email Test Tenant"',
  ].join('\n');
}

async function main(): Promise<void> {
  const recipient = process.argv[2]?.trim();
  const tenantName =
    process.argv.slice(3).join(' ').trim() || 'Email Test Tenant';

  if (recipient === '--help' || recipient === '-h') {
    console.log(usage());
    return;
  }
  if (!recipient) {
    throw new Error(usage());
  }
  if (!EMAIL_PATTERN.test(recipient)) {
    throw new Error(`Invalid recipient email: ${recipient}\n\n${usage()}`);
  }
  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
    throw new Error(
      'EMAIL_USER and EMAIL_APP_PASSWORD are required for this SMTP smoke test.',
    );
  }

  const mailService = new MailService(new ConfigService());
  mailService.onModuleInit();

  // This token is deliberately not stored. The script tests the production
  // invitation email template and link delivery without changing tenant or
  // identity state and without requiring a ZoikoID configuration.
  const token = `email-smoke-${randomBytes(24).toString('hex')}`;
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  const activationUrl = await mailService.sendOwnerInvitation({
    email: recipient,
    tenantName,
    token,
    expiresAt,
  });

  console.log(`Invitation email sent to ${recipient}.`);
  console.log(`Activation URL: ${activationUrl}`);
  console.log(
    'This is an email-only smoke test. The token is not persisted, so the activation API will reject it as expected.',
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Invitation email smoke test failed:\n${message}`);
  process.exitCode = 1;
});
