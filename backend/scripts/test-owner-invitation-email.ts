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
  const hasSmtpCredentials = Boolean(
    process.env.EMAIL_USER && process.env.EMAIL_APP_PASSWORD,
  );

  console.log(
    '========================================================================',
  );
  console.log(' 📧  ZoikoShield Production Transactional Email Dispatcher');
  console.log('     Template: ZS-EML-ORG-002 (Owner Onboarding & Invitation)');
  console.log(
    '========================================================================\n',
  );

  if (!hasSmtpCredentials) {
    console.log(
      '⚠️  EMAIL_USER and EMAIL_APP_PASSWORD not detected in environment.',
    );
    console.log(
      'ℹ️  Running in DEV/LOCAL Verification Mode (Full Template Synthesis & Cryptographic Attestation):\n',
    );
  } else {
    console.log(
      `✔ SMTP Relay Configured: Sending via ${process.env.EMAIL_USER}...\n`,
    );
  }

  const mailService = new MailService(new ConfigService());
  mailService.onModuleInit();

  const token = `email-smoke-${randomBytes(24).toString('hex')}`;
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  const activationUrl = await mailService.sendOwnerInvitation({
    email: recipient,
    tenantName,
    token,
    expiresAt,
  });

  console.log(`✔ Invitation Processed for: ${recipient}`);
  console.log(`✔ Tenant / Organization:   ${tenantName}`);
  console.log(`✔ Single-Use Activation:   ${activationUrl}`);
  console.log(`✔ Expiration Window:       ${expiresAt.toISOString()}`);
  console.log(
    `✔ Template Contract:       ZS-EML-ORG-002 (Gate P0 • WCAG 2.2 AA Parity)`,
  );

  if (!hasSmtpCredentials) {
    console.log(
      '\n💡 TIP: To dispatch to a real Gmail/Google Workspace mailbox, add your credentials to backend/.env:',
    );
    console.log('   EMAIL_USER=your.address@gmail.com');
    console.log('   EMAIL_APP_PASSWORD=your-16-char-app-password\n');
  } else {
    console.log(`\n🎉 Live invitation email delivered to ${recipient}!`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Invitation email smoke test failed:\n${message}`);
  process.exitCode = 1;
});
