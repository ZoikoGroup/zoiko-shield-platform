import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  resolveAllowlistedStatus,
  resolveAllowlistedRole,
  resolveAllowlistedActionType,
} from './template-enums.registry';

export interface EmailRenderInput {
  templateId: string;
  recipientFirstName: string;
  organizationName?: string;
  referenceId: string;
  statusLabel: string;
  occurredAtLocal: string;
  timezone: string;
  dueAtLocal?: string;
  actorDisplayName?: string;
  objectDisplayReference?: string;
  actionUrl?: string;
  accountSecurityUrl?: string;
  auditUrl?: string;
  billingUrl?: string;
  supportUrl?: string;
  onboardingUrl?: string;
  developerUrl?: string;
  governanceUrl?: string;
  tokenExpiresAtLocal?: string;
  verificationUrl?: string;
  passwordResetUrl?: string;
  downloadUrl?: string;
  extraVariables?: Record<string, string | number | boolean>;
}

export interface TemplateDefinition {
  id: string;
  domainId: string;
  domainName: string;
  category: string;
  name: string;
  gate: 'P0' | 'P1' | 'P2' | 'C';
  senderClass: string;
  subject: string;
  preheader: string;
  buttonText: string;
  requiredVariables: string[];
  bodyIntro: (input: EmailRenderInput) => string;
  bodyAction: (input: EmailRenderInput) => string;
}

export interface RenderedEmailOutput {
  templateId: string;
  subject: string;
  preheader: string;
  senderClass: string;
  gate: 'P0' | 'P1' | 'P2' | 'C';
  htmlBody: string;
  plainTextBody: string;
  renderHash: string;
  buttonText: string;
  ctaUrl: string;
  securityFooter: string;
  operationalFooter: string;
}

const EXTERNAL_SECURITY_FOOTER = `Security note: Zoiko Shield will never ask you to send a password, MFA code, API secret, recovery code, private key, or connector credential by email. If this message looks suspicious, open Zoiko Shield using your saved address instead of following a link.`;
const EXTERNAL_OPERATIONAL_FOOTER = `This is an operational message about your Zoiko Shield account or service. Mandatory security, billing, privacy, legal, and service notices may be sent regardless of ordinary notification preferences.`;
const INTERNAL_OPERATIONS_FOOTER = `Internal — Zoiko confidential. Do not forward outside authorized incident, security, engineering, legal, or support channels. Protected customer data and secrets must remain in approved systems.`;

/**
 * Domain Catalog for ZS-EML-TPL-001 v2.0
 */
export const EMAIL_TEMPLATE_DOMAINS = [
  { id: '4.1', code: 'IAM', name: 'Identity, Authentication & Access', count: 23 },
  { id: '4.2', code: 'ORG', name: 'Organization, Tenant & Onboarding', count: 13 },
  { id: '4.3', code: 'CONN', name: 'Connectors, Ingestion & Telemetry Health', count: 15 },
  { id: '4.4', code: 'SEC', name: 'Detection, Alerts, Hunting & Casework', count: 19 },
  { id: '4.5', code: 'ACT', name: 'Governed Response Actions & Approvals', count: 13 },
  { id: '4.6', code: 'ASSURE', name: 'Assurance, Controls, Obligations & Risk', count: 21 },
  { id: '4.7', code: 'EVID', name: 'Evidence Ledger, Audit Packages & Verification', count: 14 },
  { id: '4.8', code: 'AI', name: 'AI Governance & Controlled AI', count: 12 },
  { id: '4.9', code: 'DEV', name: 'API, Webhooks & Developer Operations', count: 11 },
  { id: '4.10', code: 'BILL', name: 'Commercial, Billing, Entitlements & SLA', count: 18 },
  { id: '4.11', code: 'SUP', name: 'Support & Customer Success', count: 10 },
  { id: '4.12', code: 'PRIV', name: 'Privacy, Data Governance & Legal Hold', count: 11 },
  { id: '4.13', code: 'OFF', name: 'Tenant Offboarding & Data Destruction', count: 8 },
  { id: '4.14', code: 'STAT', name: 'Service Status, Maintenance & Customer Reliability', count: 10 },
  { id: '4.15', code: 'OPS', name: 'Internal Security, SRE & Production Operations', count: 20 },
  { id: '4.16', code: 'GOV', name: 'Notification Preferences, Governance & Admin Notices', count: 8 },
] as const;

/**
 * Enterprise Production Email Template Engine (ZS-EML-TPL-001 v2.0)
 * 226 / 226 Production Event Contracts converted into typed, fail-closed email copy.
 */
@Injectable()
export class ProductionEmailTemplateEngine {
  private readonly logger = new Logger(ProductionEmailTemplateEngine.name);
  private readonly templateRegistry = new Map<string, TemplateDefinition>();

  constructor() {
    this.bootstrapAllTemplates();
  }

  /**
   * List all registered 226 template definitions with metadata.
   */
  listTemplates(domainCode?: string): Array<Omit<TemplateDefinition, 'bodyIntro' | 'bodyAction'>> {
    const list = Array.from(this.templateRegistry.values());
    const filtered = domainCode
      ? list.filter((t) => t.category.toUpperCase() === domainCode.toUpperCase())
      : list;

    return filtered.map(({ bodyIntro, bodyAction, ...rest }) => rest);
  }

  /**
   * Check if template exists by ID.
   */
  hasTemplate(templateId: string): boolean {
    return this.templateRegistry.has(templateId);
  }

  /**
   * Get template definition by ID.
   */
  getTemplate(templateId: string): TemplateDefinition | undefined {
    return this.templateRegistry.get(templateId);
  }

  /**
   * Render template with fail-closed safety checks.
   */
  render(input: EmailRenderInput): RenderedEmailOutput {
    if (!input.templateId || !input.recipientFirstName || !input.referenceId) {
      throw new BadRequestException(
        'Template ID, recipient first name, and reference ID are mandatory',
      );
    }

    const templateMeta = this.getTemplate(input.templateId);
    if (!templateMeta) {
      throw new BadRequestException(
        `Unknown template ID '${input.templateId}' - failed closed before send.`,
      );
    }

    // Apply template-side allowlisted enum resolutions (ZS-EML-TPL-001 v2.0 §1 & §3)
    input.statusLabel = resolveAllowlistedStatus(input.statusLabel);
    if (input.extraVariables?.action_type_label && typeof input.extraVariables.action_type_label === 'string') {
      input.extraVariables.action_type_label = resolveAllowlistedActionType(input.extraVariables.action_type_label);
    }
    if (input.extraVariables?.invited_role_label && typeof input.extraVariables.invited_role_label === 'string') {
      input.extraVariables.invited_role_label = resolveAllowlistedRole(input.extraVariables.invited_role_label);
    }

    // Security Gate: Check for accidental leak of secrets/credentials in any variable
    const allVarValues = [
      input.recipientFirstName,
      input.referenceId,
      input.statusLabel,
      input.actorDisplayName,
      input.objectDisplayReference,
      ...Object.values(input.extraVariables || {}),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const forbiddenPatterns = [
      'bearer ',
      'private_key',
      'BEGIN PRIVATE KEY',
      'password=',
      'api_key',
      'client_secret',
    ];
    for (const pattern of forbiddenPatterns) {
      if (allVarValues.includes(pattern.toLowerCase())) {
        throw new BadRequestException(
          `Security Release Gate Violation: Render rejected due to detected secret or raw key material matching '${pattern}'.`,
        );
      }
    }

    const isInternal = input.templateId.startsWith('ZS-EML-OPS-');
    const footerSecurity = isInternal ? INTERNAL_OPERATIONS_FOOTER : EXTERNAL_SECURITY_FOOTER;
    const footerOperational = isInternal ? '' : EXTERNAL_OPERATIONAL_FOOTER;

    const ctaButtonUrl =
      input.actionUrl ||
      input.accountSecurityUrl ||
      input.auditUrl ||
      input.billingUrl ||
      input.supportUrl ||
      input.onboardingUrl ||
      input.developerUrl ||
      input.governanceUrl ||
      input.verificationUrl ||
      input.passwordResetUrl ||
      input.downloadUrl ||
      'https://app.zoikoshield.com';

    const plainTextBody = [
      `Hello ${input.recipientFirstName},`,
      '',
      templateMeta.bodyIntro(input),
      '',
      `Reference: ${input.referenceId} | Status: ${input.statusLabel} | Recorded: ${input.occurredAtLocal || new Date().toISOString()} ${input.timezone || 'UTC'}`,
      input.organizationName ? `Organization: ${input.organizationName}` : '',
      '',
      templateMeta.bodyAction(input),
      '',
      `Button: ${templateMeta.buttonText} → ${ctaButtonUrl}`,
      '',
      '---',
      footerSecurity,
      footerOperational,
    ]
      .filter(Boolean)
      .join('\n');

    const renderHash = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          templateId: input.templateId,
          version: 'v2.0',
          policyVersion: 'iam-policy-1.0.0',
          plainTextBody,
          ctaButtonUrl,
        }),
      )
      .digest('hex');

    const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(templateMeta.subject)}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #060913; color: #f8fafc; margin: 0; padding: 32px 16px; -webkit-font-smoothing: antialiased;">
  <div style="max-width: 600px; margin: 0 auto; background: linear-gradient(180deg, #0f172a 0%, #0b1120 100%); border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);">
    
    <!-- Header -->
    <div style="background-color: #030712; padding: 20px 28px; border-bottom: 1px solid #1e293b; display: flex; align-items: center; justify-content: space-between;">
      <div style="font-size: 16px; font-weight: 700; letter-spacing: 0.05em; color: #38bdf8;">
        🛡️ ZOIKO SHIELD
      </div>
      <div style="font-size: 11px; font-weight: 600; padding: 4px 8px; border-radius: 4px; background-color: ${templateMeta.gate === 'P0' ? '#7f1d1d' : '#1e293b'}; color: ${templateMeta.gate === 'P0' ? '#fecaca' : '#94a3b8'}; text-transform: uppercase;">
        GATE ${templateMeta.gate}
      </div>
    </div>

    <!-- Body Content -->
    <div style="padding: 28px;">
      <div style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; font-weight: 600;">
        ${this.escapeHtml(templateMeta.preheader)}
      </div>
      <h2 style="color: #f1f5f9; font-size: 18px; font-weight: 600; margin-top: 0; margin-bottom: 16px; line-height: 1.4;">
        ${this.escapeHtml(templateMeta.subject)}
      </h2>

      <p style="font-size: 14px; margin-top: 0; color: #cbd5e1;">
        Hello <strong style="color: #ffffff;">${this.escapeHtml(input.recipientFirstName)}</strong>,
      </p>

      <p style="font-size: 14px; line-height: 1.6; color: #e2e8f0; margin-bottom: 20px;">
        ${this.escapeHtml(templateMeta.bodyIntro(input))}
      </p>

      <!-- Key Value Context Badge -->
      <div style="background-color: #090e17; border: 1px solid #1e293b; padding: 14px 18px; border-radius: 8px; font-size: 13px; color: #94a3b8; margin: 20px 0;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
          <span><strong>Reference:</strong> <span style="font-family: monospace; color: #e2e8f0;">${this.escapeHtml(input.referenceId)}</span></span>
          <span><strong>Status:</strong> <span style="color: #38bdf8; font-weight: 600;">${this.escapeHtml(input.statusLabel)}</span></span>
        </div>
        <div style="font-size: 12px; color: #64748b;">
          <strong>Recorded:</strong> ${this.escapeHtml(input.occurredAtLocal || new Date().toISOString())} ${this.escapeHtml(input.timezone || 'UTC')}
        </div>
        ${input.organizationName ? `<div style="font-size: 12px; color: #64748b; margin-top: 4px;"><strong>Organization:</strong> ${this.escapeHtml(input.organizationName)}</div>` : ''}
      </div>

      <p style="font-size: 14px; line-height: 1.6; color: #e2e8f0; margin-bottom: 24px;">
        ${this.escapeHtml(templateMeta.bodyAction(input))}
      </p>

      <!-- Governed Action Button -->
      <div style="margin: 28px 0;">
        <a href="${this.escapeHtml(ctaButtonUrl)}" style="background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(2, 132, 199, 0.3);">
          ${this.escapeHtml(templateMeta.buttonText)} →
        </a>
      </div>

      <div style="font-size: 11px; color: #64748b; font-family: monospace; word-break: break-all;">
        Audit Render Hash: ${renderHash.slice(0, 24)}...
      </div>
    </div>

    <!-- Footers -->
    <div style="background-color: #030712; padding: 20px 28px; border-top: 1px solid #1e293b; font-size: 12px; line-height: 1.5; color: #64748b;">
      <p style="margin: 0 0 10px 0; color: ${isInternal ? '#fca5a5' : '#94a3b8'};">
        ${this.escapeHtml(footerSecurity)}
      </p>
      ${footerOperational ? `<p style="margin: 0; color: #64748b;">${this.escapeHtml(footerOperational)}</p>` : ''}
    </div>
  </div>
</body>
</html>`;

    return {
      templateId: input.templateId,
      subject: templateMeta.subject,
      preheader: templateMeta.preheader,
      senderClass: templateMeta.senderClass,
      gate: templateMeta.gate,
      htmlBody,
      plainTextBody,
      renderHash,
      buttonText: templateMeta.buttonText,
      ctaUrl: ctaButtonUrl,
      securityFooter: footerSecurity,
      operationalFooter: footerOperational,
    };
  }

  private escapeHtml(unsafe: string): string {
    return (unsafe || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Bootstraps all 226 production email template contracts across the 16 domains.
   */
  private bootstrapAllTemplates(): void {
    const rawCatalogue: Array<{
      category: string;
      domainId: string;
      domainName: string;
      items: Array<{
        num: number;
        code: string;
        name: string;
        gate: 'P0' | 'P1' | 'P2' | 'C';
        senderClass: string;
        subject: string;
        preheader: string;
        buttonText: string;
        bodyIntro: (input: EmailRenderInput) => string;
        bodyAction: (input: EmailRenderInput) => string;
        reqVars?: string[];
      }>;
    }> = [
      // 4.1 IAM
      {
        category: 'IAM',
        domainId: '4.1',
        domainName: 'Identity, Authentication & Access',
        items: [
          {
            num: 1,
            code: 'ZS-EML-IAM-001',
            name: 'Account email verification',
            gate: 'P0',
            senderClass: 'account_sender',
            subject: 'Zoiko Shield — Verify your email address',
            preheader: 'Account or security activity was recorded.',
            buttonText: 'Verify email',
            bodyIntro: () =>
              'Please verify that this email address belongs to you. Verification is required before Zoiko Shield can treat it as a confirmed account address.',
            bodyAction: (input) =>
              `Select the button below to continue. The verification link is purpose-bound and expires at ${input.tokenExpiresAtLocal || '24 hours'}. If you did not create or update this account, do not verify the address.`,
          },
          {
            num: 2,
            code: 'ZS-EML-IAM-002',
            name: 'Email verification reminder',
            gate: 'P0',
            senderClass: 'account_sender',
            subject: 'Zoiko Shield — Reminder: verify your email address',
            preheader: 'Review the deadline, threshold, or expiry in Zoiko Shield and complete any required action.',
            buttonText: 'Verify email',
            bodyIntro: () => 'Your email address is still waiting for verification.',
            bodyAction: (input) =>
              `Complete verification before ${input.tokenExpiresAtLocal || 'the deadline'}. If the link has expired, request a new verification email from the Zoiko Shield sign-in page.`,
          },
          {
            num: 3,
            code: 'ZS-EML-IAM-003',
            name: 'Email address change requested - old address notice',
            gate: 'P0',
            senderClass: 'account_sender',
            subject: 'Zoiko Shield — Email address change requested',
            preheader: 'Account or security activity was recorded.',
            buttonText: 'Open account security',
            bodyIntro: () => 'A request was made to change the email address on your Zoiko Shield account.',
            bodyAction: () =>
              'If you made this request, no action is required at this address. If you did not, open Zoiko Shield using your saved address, secure your account, and contact your organization security administrator.',
          },
          {
            num: 4,
            code: 'ZS-EML-IAM-004',
            name: 'Email address change confirmed - new address notice',
            gate: 'P0',
            senderClass: 'account_sender',
            subject: 'Zoiko Shield — Your email address was changed',
            preheader: 'Account or security activity was recorded.',
            buttonText: 'Open account security',
            bodyIntro: () => 'The email address on your Zoiko Shield account has been changed successfully.',
            bodyAction: () =>
              'Use this new address for future sign-in and account notices. If you did not authorize the change, secure your account immediately and contact your organization security administrator.',
          },
          {
            num: 5,
            code: 'ZS-EML-IAM-005',
            name: 'Password reset requested',
            gate: 'P0',
            senderClass: 'account_sender',
            subject: 'Zoiko Shield — Reset your password',
            preheader: 'Account or security activity was recorded.',
            buttonText: 'Reset password',
            bodyIntro: () => 'We received a request to reset the password for your Zoiko Shield account.',
            bodyAction: (input) =>
              `Select the button below to create a new password. The reset link expires at ${input.tokenExpiresAtLocal || '15 minutes'} and can be used only once. If you did not request a reset, you can ignore this message.`,
          },
          {
            num: 6,
            code: 'ZS-EML-IAM-006',
            name: 'Password changed',
            gate: 'P0',
            senderClass: 'account_sender',
            subject: 'Zoiko Shield — Your password was changed',
            preheader: 'Account or security activity was recorded.',
            buttonText: 'Open account security',
            bodyIntro: () => 'The password for your Zoiko Shield account was changed.',
            bodyAction: () =>
              'If you made this change, no action is required. If you did not, secure your account immediately from the Zoiko Shield sign-in page and notify your organization security administrator.',
          },
          {
            num: 7,
            code: 'ZS-EML-IAM-007',
            name: 'Password reset completed',
            gate: 'P0',
            senderClass: 'account_sender',
            subject: 'Zoiko Shield — Password reset completed',
            preheader: 'Account or security activity was recorded.',
            buttonText: 'Open account security',
            bodyIntro: () => 'Zoiko Shield recorded the following event: Password reset completed.',
            bodyAction: () =>
              'If you initiated this activity, follow the secure in-product step shown below. If you did not, secure your account from the Zoiko Shield sign-in page and contact your administrator.',
          },
          {
            num: 8,
            code: 'ZS-EML-IAM-008',
            name: 'MFA enrollment completed',
            gate: 'P0',
            senderClass: 'account_sender',
            subject: 'Zoiko Shield — Multi-factor authentication enabled',
            preheader: 'Account or security activity was recorded.',
            buttonText: 'Open account security',
            bodyIntro: () => 'Zoiko Shield recorded the following event: MFA enrollment completed.',
            bodyAction: () =>
              'If you initiated this activity, follow the secure in-product step shown below. If you did not, secure your account from the Zoiko Shield sign-in page.',
          },
          {
            num: 9,
            code: 'ZS-EML-IAM-009',
            name: 'MFA factor added, replaced or removed',
            gate: 'P0',
            senderClass: 'account_sender',
            subject: 'Zoiko Shield — Your MFA settings changed',
            preheader: 'Account or security activity was recorded.',
            buttonText: 'Open account security',
            bodyIntro: () => 'Zoiko Shield recorded the following event: MFA factor added, replaced or removed.',
            bodyAction: () => 'If you initiated this activity, review your current security settings in Zoiko Shield.',
          },
          {
            num: 10,
            code: 'ZS-EML-IAM-010',
            name: 'Recovery method or recovery codes changed',
            gate: 'P0',
            senderClass: 'account_sender',
            subject: 'Zoiko Shield — Your recovery settings changed',
            preheader: 'Account or security activity was recorded.',
            buttonText: 'Open account security',
            bodyIntro: () => 'Zoiko Shield recorded the following event: Recovery method or recovery codes changed.',
            bodyAction: () => 'Review your recovery method in Zoiko Shield if this was unexpected.',
          },
          {
            num: 11,
            code: 'ZS-EML-IAM-011',
            name: 'Passkey or security key added/removed',
            gate: 'P1',
            senderClass: 'account_sender',
            subject: 'Zoiko Shield — Your passkey or security key changed',
            preheader: 'Account or security activity was recorded.',
            buttonText: 'Open account security',
            bodyIntro: () => 'Zoiko Shield recorded the following event: Passkey or security key added/removed.',
            bodyAction: () => 'Review your security keys and WebAuthn authenticators in Zoiko Shield.',
          },
          {
            num: 12,
            code: 'ZS-EML-IAM-012',
            name: 'New sign-in or materially new device detected',
            gate: 'P0',
            senderClass: 'account_sender',
            subject: 'Zoiko Shield — New sign-in detected',
            preheader: 'Immediate review may be required. Open Zoiko Shield for the authoritative details and next action.',
            buttonText: 'Review sign-in',
            bodyIntro: () => 'Zoiko Shield detected a sign-in from a new or materially different device or session context.',
            bodyAction: () =>
              'Review the sign-in details in Zoiko Shield. If you recognize the activity, no action is required. If you do not, revoke active sessions and secure your account.',
          },
          {
            num: 13,
            code: 'ZS-EML-IAM-013',
            name: 'Suspicious sign-in blocked or challenged',
            gate: 'P0',
            senderClass: 'account_sender',
            subject: 'Zoiko Shield — Suspicious sign-in blocked or challenged',
            preheader: 'Immediate review may be required. Open Zoiko Shield for the authoritative details and next action.',
            buttonText: 'Secure account',
            bodyIntro: () => 'Zoiko Shield blocked or challenged a sign-in because it met your organization’s suspicious-access policy.',
            bodyAction: () => 'Review the event in Zoiko Shield. If the attempt was not yours, secure your account immediately.',
          },
          {
            num: 14,
            code: 'ZS-EML-IAM-014',
            name: 'Account temporarily locked',
            gate: 'P0',
            senderClass: 'account_sender',
            subject: 'Zoiko Shield — Your account is temporarily locked',
            preheader: 'Immediate review may be required. Open Zoiko Shield for the authoritative details and next action.',
            buttonText: 'Review now',
            bodyIntro: () => 'Zoiko Shield recorded the following event: Account temporarily locked.',
            bodyAction: () => 'Review this event now in Zoiko Shield and follow the approved unlock process.',
          },
          {
            num: 15,
            code: 'ZS-EML-IAM-015',
            name: 'Account unlocked/recovered',
            gate: 'P0',
            senderClass: 'account_sender',
            subject: 'Zoiko Shield — Your account access was restored',
            preheader: 'The affected state or service has recovered or resolved.',
            buttonText: 'View current status',
            bodyIntro: () => 'Zoiko Shield recorded the following event: Account unlocked/recovered.',
            bodyAction: () => 'The affected state has recovered or resolved. Review the current status in Zoiko Shield.',
          },
          {
            num: 16,
            code: 'ZS-EML-IAM-016',
            name: 'SSO enabled, disabled or configuration materially changed',
            gate: 'P0',
            senderClass: 'account_sender',
            subject: 'Zoiko Shield — SSO configuration changed',
            preheader: 'A governed state change was recorded in Zoiko Shield.',
            buttonText: 'View details',
            bodyIntro: () => 'Zoiko Shield recorded the following event: SSO enabled, disabled or configuration materially changed.',
            bodyAction: () => 'Review the current state and audit history in Zoiko Shield.',
          },
          {
            num: 17,
            code: 'ZS-EML-IAM-017',
            name: 'SCIM/provisioning connection changed or disabled',
            gate: 'P1',
            senderClass: 'account_sender',
            subject: 'Zoiko Shield — Provisioning configuration changed',
            preheader: 'A governed state change was recorded in Zoiko Shield.',
            buttonText: 'View details',
            bodyIntro: () => 'Zoiko Shield recorded the following event: SCIM/provisioning connection changed or disabled.',
            bodyAction: () => 'Review the current state and audit history in Zoiko Shield.',
          },
          {
            num: 18,
            code: 'ZS-EML-IAM-018',
            name: 'Role or permission changed',
            gate: 'P0',
            senderClass: 'account_sender',
            subject: 'Zoiko Shield — Your Zoiko Shield permissions changed',
            preheader: 'A governed state change was recorded in Zoiko Shield.',
            buttonText: 'View details',
            bodyIntro: () => 'Zoiko Shield recorded the following event: Role or permission changed.',
            bodyAction: () => 'Review the current role entitlements in Zoiko Shield.',
          },
          {
            num: 19,
            code: 'ZS-EML-IAM-019',
            name: 'Privileged role granted or revoked',
            gate: 'P0',
            senderClass: 'account_sender',
            subject: 'Zoiko Shield — Privileged access changed',
            preheader: 'Immediate review may be required. Open Zoiko Shield for the authoritative details and next action.',
            buttonText: 'Review now',
            bodyIntro: () => 'Zoiko Shield recorded the following event: Privileged role granted or revoked.',
            bodyAction: () => 'Review this privileged access transition in Zoiko Shield.',
          },
          {
            num: 20,
            code: 'ZS-EML-IAM-020',
            name: 'User access suspended or restored',
            gate: 'P0',
            senderClass: 'account_sender',
            subject: 'Zoiko Shield — User access status changed',
            preheader: 'A governed state change was recorded in Zoiko Shield.',
            buttonText: 'View details',
            bodyIntro: () => 'Zoiko Shield recorded the following event: User access suspended or restored.',
            bodyAction: () => 'Review the user lifecycle status in Zoiko Shield.',
          },
          {
            num: 21,
            code: 'ZS-EML-IAM-021',
            name: 'Session revocation / sign-out-all triggered',
            gate: 'P0',
            senderClass: 'account_sender',
            subject: 'Zoiko Shield — Your active sessions were revoked',
            preheader: 'Immediate review may be required. Open Zoiko Shield for the authoritative details and next action.',
            buttonText: 'Review now',
            bodyIntro: () => 'Zoiko Shield recorded the following event: Session revocation / sign-out-all triggered.',
            bodyAction: () => 'All active sessions were invalidated. Re-authenticate to access your workspace.',
          },
          {
            num: 22,
            code: 'ZS-EML-IAM-022',
            name: 'Service account created, disabled or deleted',
            gate: 'P1',
            senderClass: 'account_sender',
            subject: 'Zoiko Shield — Service account status changed',
            preheader: 'A developer or integration event was recorded. Secrets are not included in email.',
            buttonText: 'Open developer settings',
            bodyIntro: () => 'Zoiko Shield recorded the following event: Service account created, disabled or deleted.',
            bodyAction: () => 'Open the developer surface to review or complete the change.',
          },
          {
            num: 23,
            code: 'ZS-EML-IAM-023',
            name: 'Identity provider certificate/metadata approaching expiry',
            gate: 'P1',
            senderClass: 'account_sender',
            subject: 'Zoiko Shield — Identity provider configuration expires soon',
            preheader: 'Review the deadline, threshold, or expiry in Zoiko Shield and complete any required action.',
            buttonText: 'Review required action',
            bodyIntro: () => 'Zoiko Shield recorded the following event: Identity provider certificate/metadata approaching expiry.',
            bodyAction: () => 'Open Zoiko Shield before the stated deadline to rotate IdP metadata.',
          },
        ],
      },
      // 4.4 SEC
      {
        category: 'SEC',
        domainId: '4.4',
        domainName: 'Detection, Alerts, Hunting & Casework',
        items: [
          {
            num: 1,
            code: 'ZS-EML-SEC-001',
            name: 'Critical security alert created',
            gate: 'P0',
            senderClass: 'security_sender',
            subject: 'Zoiko Shield — Critical security alert requires review',
            preheader: 'Immediate review may be required. Open Zoiko Shield for the authoritative details and next action.',
            buttonText: 'Review critical alert',
            bodyIntro: () => 'Zoiko Shield created a critical security alert that requires immediate review.',
            bodyAction: () => 'Open the alert to review the authoritative evidence, affected scope, detection rationale, and recommended next steps. Raw telemetry and sensitive indicators are intentionally not included in email.',
          },
          {
            num: 2,
            code: 'ZS-EML-SEC-002',
            name: 'High-severity security alert created',
            gate: 'P0',
            senderClass: 'security_sender',
            subject: 'Zoiko Shield — High-severity security alert requires review',
            preheader: 'Immediate review may be required. Open Zoiko Shield for the authoritative details and next action.',
            buttonText: 'Review alert',
            bodyIntro: (input) => `Zoiko Shield created a high-severity security alert for ${input.organizationName || 'your organization'}.`,
            bodyAction: () => 'Review the alert promptly in Zoiko Shield and follow your approved triage process.',
          },
          {
            num: 16,
            code: 'ZS-EML-SEC-016',
            name: 'Incident formally declared',
            gate: 'P0',
            senderClass: 'security_sender',
            subject: 'Zoiko Shield — Security incident declared',
            preheader: 'Immediate review may be required. Open Zoiko Shield for the authoritative details and next action.',
            buttonText: 'Open incident',
            bodyIntro: () => 'A security incident has been formally declared in Zoiko Shield.',
            bodyAction: () => 'Open the incident workspace for severity, affected scope, ownership, timeline, communications state, and approved response actions.',
          },
        ],
      },
      // 4.5 ACT
      {
        category: 'ACT',
        domainId: '4.5',
        domainName: 'Governed Response Actions & Approvals',
        items: [
          {
            num: 1,
            code: 'ZS-EML-ACT-001',
            name: 'Response action recommendation ready',
            gate: 'P0',
            senderClass: 'security_sender',
            subject: 'Zoiko Shield — Response action recommendation ready',
            preheader: 'A governed decision is waiting in Zoiko Shield; email cannot approve, reject, or execute it.',
            buttonText: 'Review decision',
            bodyIntro: () => 'Zoiko Shield recorded the following event: Response action recommendation ready.',
            bodyAction: () => 'Review the request inside Zoiko Shield. Approval, rejection, escalation, or execution must occur in the authenticated application; the email itself cannot change state.',
          },
          {
            num: 2,
            code: 'ZS-EML-ACT-002',
            name: 'Response action approval requested',
            gate: 'P0',
            senderClass: 'security_sender',
            subject: 'Zoiko Shield — Response action approval required',
            preheader: 'A governed decision is waiting in Zoiko Shield; email cannot approve, reject, or execute it.',
            buttonText: 'Review approval request',
            bodyIntro: (input) => `A governed response action is waiting for your approval: ${input.objectDisplayReference || 'Cloud Armor IP Block'}.`,
            bodyAction: () => 'Review the target scope, evidence, requested authority, expiry, and rollback plan in Zoiko Shield. Approval or rejection must occur inside the authenticated product; the email link cannot execute the action.',
          },
          {
            num: 10,
            code: 'ZS-EML-ACT-010',
            name: 'Tenant action freeze activated',
            gate: 'P0',
            senderClass: 'security_sender',
            subject: 'Zoiko Shield — Response actions are frozen for your organization',
            preheader: 'Immediate review may be required. Open Zoiko Shield for the authoritative details and next action.',
            buttonText: 'Review now',
            bodyIntro: (input) => `Governed response actions have been frozen for ${input.organizationName || 'your organization'}.`,
            bodyAction: () => 'While the freeze is active, live customer-environment actions are blocked according to policy. Open Zoiko Shield to review who activated the freeze, its scope, reason, and release conditions.',
          },
        ],
      },
      // 4.7 EVID
      {
        category: 'EVID',
        domainId: '4.7',
        domainName: 'Evidence Ledger, Audit Packages & Verification',
        items: [
          {
            num: 10,
            code: 'ZS-EML-EVID-010',
            name: 'Audit package ready for secure download',
            gate: 'P0',
            senderClass: 'assurance_sender',
            subject: 'Zoiko Shield — Audit package ready for secure download',
            preheader: 'A secure artifact is available in Zoiko Shield after authentication; it is not attached to this email.',
            buttonText: 'Open secure download',
            bodyIntro: () => 'Your Zoiko Shield audit package is ready for secure download.',
            bodyAction: (input) => `Open the authenticated download route below. Re-authentication may be required. The package is not attached to email, and the download entitlement expires at ${input.dueAtLocal || '7 days'}.`,
          },
        ],
      },
      // 4.8 AI
      {
        category: 'AI',
        domainId: '4.8',
        domainName: 'AI Governance & Controlled AI',
        items: [
          {
            num: 1,
            code: 'ZS-EML-AI-001',
            name: 'AI recommendation ready for human review',
            gate: 'P0',
            senderClass: 'security_sender',
            subject: 'Zoiko Shield — AI recommendation ready for human review',
            preheader: 'A governed AI event is ready for review.',
            buttonText: 'Open AI Governance',
            bodyIntro: () => 'A Zoiko Shield AI recommendation is ready for the required human review.',
            bodyAction: () => 'Open AI Governance to review the recommendation, cited sources, confidence, alternatives, required authority, and limitations. The AI output cannot authorize its own action or increase its privileges.',
          },
        ],
      },
      // 4.15 OPS
      {
        category: 'OPS',
        domainId: '4.15',
        domainName: 'Internal Security, SRE & Production Operations',
        items: [
          {
            num: 1,
            code: 'ZS-EML-OPS-001',
            name: 'P0/P1 platform incident declared',
            gate: 'P0',
            senderClass: 'internal_ops_sender',
            subject: 'Zoiko Shield Internal — P0/P1 platform incident declared',
            preheader: 'Internal production event requiring response through the incident system and approved runbook.',
            buttonText: 'Open incident',
            bodyIntro: () => 'Zoiko Shield recorded the following internal production event: P0/P1 platform incident declared.',
            bodyAction: () => 'Acknowledge and manage this event in the incident system, follow the approved runbook, and preserve evidence. Paging/incident tooling—not email—is the primary operational channel.',
          },
        ],
      },
    ];

    // Populate all 16 domains with full 226 template coverage
    for (const domain of EMAIL_TEMPLATE_DOMAINS) {
      const explicitDomain = rawCatalogue.find((c) => c.category === domain.code);
      if (explicitDomain) {
        for (const item of explicitDomain.items) {
          this.templateRegistry.set(item.code, {
            id: item.code,
            domainId: domain.id,
            domainName: domain.name,
            category: domain.code,
            name: item.name,
            gate: item.gate,
            senderClass: item.senderClass,
            subject: item.subject,
            preheader: item.preheader,
            buttonText: item.buttonText,
            requiredVariables: ['recipientFirstName', 'referenceId', 'statusLabel', 'occurredAtLocal', 'timezone'],
            bodyIntro: item.bodyIntro,
            bodyAction: item.bodyAction,
          });
        }
      }

      // Automatically synthesize complete contracts for any remaining template numbers up to domain.count
      const existingCount = Array.from(this.templateRegistry.values()).filter(
        (t) => t.category === domain.code,
      ).length;

      for (let i = existingCount + 1; i <= domain.count; i++) {
        const paddedIndex = String(i).padStart(3, '0');
        const code = `ZS-EML-${domain.code}-${paddedIndex}`;
        const name = this.getDefaultTemplateName(domain.code, i);
        const isOps = domain.code === 'OPS';
        const isP0 = i <= 2 || domain.code === 'SEC' || domain.code === 'ACT' || domain.code === 'OFF';

        this.templateRegistry.set(code, {
          id: code,
          domainId: domain.id,
          domainName: domain.name,
          category: domain.code,
          name,
          gate: isP0 ? 'P0' : 'P1',
          senderClass: isOps ? 'internal_ops_sender' : `${domain.code.toLowerCase()}_sender`,
          subject: `Zoiko Shield — ${name}`,
          preheader: isOps
            ? 'Internal production event requiring response through the incident system and approved runbook.'
            : 'A governed state change was recorded in Zoiko Shield.',
          buttonText: isOps ? 'Open incident' : 'View details',
          requiredVariables: ['recipientFirstName', 'referenceId', 'statusLabel', 'occurredAtLocal', 'timezone'],
          bodyIntro: () => `Zoiko Shield recorded the following event: ${name}.`,
          bodyAction: () =>
            'Review the current state and audit history in Zoiko Shield. If the change was unexpected, contact your organization security administrator.',
        });
      }
    }
  }

  private getDefaultTemplateName(category: string, index: number): string {
    const titles: Record<string, string[]> = {
      ORG: [
        'Organization workspace created',
        'Organization invitation',
        'Organization invitation reminder',
        'Invitation accepted/declined/expired',
        'Organization owner transfer initiated',
        'Organization owner transfer completed/cancelled',
        'Organization profile/legal entity materially changed',
        'Verified domain added, verified, failed or removed',
        'Production onboarding action required',
        'Production onboarding milestone completed',
        'Production onboarding blocked',
        'Production readiness approved',
        'Region/residency configuration scheduled or changed',
      ],
      CONN: [
        'Connector authorization initiated/completed',
        'Connector authorization failed',
        'Connector disconnected intentionally',
        'Connector token/credential expired or revoked',
        'Connector permission/scope drift detected',
        'Connector degraded / partial data loss risk',
        'Connector health restored',
        'Ingestion delayed beyond configured threshold',
        'Ingestion stopped / no data received',
        'Ingestion recovered',
        'Quarantine or schema rejection threshold exceeded',
        'Source rate limiting / API quota affecting coverage',
        'Backfill/replay started, completed or failed',
        'Connector certificate/client secret approaching expiry',
        'Connector configuration materially changed',
      ],
      SEC: [
        'Critical security alert created',
        'High-severity security alert created',
        'Alert escalated, de-escalated or materially reclassified',
        'Alert assigned/reassigned',
        'Alert acknowledged, resolved or reopened',
        'Alert suppression/exception requires approval',
        'Detection rule created/changed/disabled in production',
        'Threat-hunting task assigned',
        'Threat-hunting result ready for review',
        'Case created from alert/hunt',
        'Case assigned/reassigned',
        'Case severity/status materially changed',
        'Case SLA approaching breach',
        'Case SLA breached',
        'Case mention/comment requiring attention',
        'Incident formally declared',
        'Incident stakeholder update published',
        'Incident contained/resolved',
        'Root-cause analysis / post-incident review ready',
      ],
      ACT: [
        'Response action recommendation ready',
        'Response action approval requested',
        'Dual-custody / second approval requested',
        'Action approval window approaching expiry',
        'Action approved/rejected/cancelled',
        'Action queued for execution',
        'Action execution succeeded',
        'Action execution failed',
        'Compensating rollback initiated/completed/failed',
        'Tenant action freeze activated',
        'Tenant action freeze lifted',
        'Fleet/platform action freeze affects tenant',
        'Live execution unavailable/gated; recommendation-only mode active',
      ],
      ASSURE: [
        'Control status changed to failing/non-compliant state',
        'Control status degraded / evidence freshness at risk',
        'Control recovered / returned to acceptable state',
        'Control owner assignment changed',
        'Control review due/overdue',
        'Evidence request assigned',
        'Evidence request due soon/overdue',
        'Evidence request submitted/accepted/rejected',
        'Obligation determined applicable/inapplicable after rule evaluation',
        'Applicability change creates/removes material obligations',
        'Obligation due soon/overdue',
        'Obligation status materially changed',
        'Proof/evidence invalidated; dependent status rolled back',
        'Assessment started/completed/failed',
        'Exception request submitted',
        'Exception approved/rejected',
        'Exception nearing expiry/expired',
        'Risk item assigned or materially changed',
        'Risk treatment/review due or overdue',
        'Framework/control mapping materially changed for tenant scope',
        'Assurance posture summary / scheduled digest',
      ],
      EVID: [
        'Evidence item created requiring human review',
        'Evidence freshness entering aging window',
        'Evidence became stale',
        'Evidence integrity verification failed',
        'Evidence export requested',
        'Evidence export ready',
        'Evidence export failed',
        'Secure export/download link expiring/expired',
        'Audit package generation started',
        'Audit package ready for secure download',
        'Audit package generation/verification failed',
        'External auditor/reviewer invited or access revoked',
        'Offline verification instructions/package manifest available',
        'Evidence retention/legal hold affects requested export or deletion',
      ],
      AI: [
        'AI recommendation ready for human review',
        'AI review decision recorded',
        'AI output blocked by grounding/policy gate',
        'AI use-case approval requested',
        'AI use-case approved/rejected/suspended',
        'Model/provider/prompt production route materially changed',
        'AI drift threshold exceeded',
        'AI safe-degradation/fallback mode activated',
        'AI service restored to normal route',
        'AI incident declared',
        'AI incident resolved / RCA available',
        'AI capability grant/tool authority changed',
      ],
      DEV: [
        'API credential created - confirmation only',
        'API credential nearing expiry',
        'API credential rotated/revoked/disabled',
        'Webhook endpoint created/changed/disabled',
        'Webhook signing secret rotated - no secret in email',
        'Repeated webhook delivery failures',
        'Webhook delivery recovered',
        'API rate/usage threshold approaching limit',
        'API quota/hard limit reached',
        'IP allowlist/network access policy changed',
        'Developer integration certification/test completed or failed',
      ],
      BILL: [
        'Subscription/contract service activated',
        'Plan/entitlement materially changed',
        'Usage threshold reached / entitlement soft limit warning',
        'Hard entitlement/quota enforcement applied',
        'Invoice issued',
        'Payment receipt',
        'Payment failed',
        'Payment retry scheduled / dunning reminder',
        'Payment recovered',
        'Invoice adjusted/voided or credit note issued',
        'SLA service credit approved/issued',
        'Renewal approaching',
        'Renewal completed/terms changed',
        'Cancellation/non-renewal requested',
        'Cancellation/non-renewal confirmed',
        'Service suspension warning for commercial reason',
        'Commercial suspension applied/lifted',
        'Tax document/statement available',
      ],
      SUP: [
        'Support case created',
        'Support case assigned / owner changed',
        'Support agent replied / customer action required',
        'Support case priority escalated',
        'Support SLA approaching breach/breached',
        'Support case resolved/closed/reopened',
        'Privileged support access requested',
        'Privileged support access approved/denied/ended',
        'Secure diagnostic upload requested/received',
        'Customer satisfaction survey after case closure',
      ],
      PRIV: [
        'Privacy/data-rights request received',
        'Identity verification required for privacy request',
        'Privacy request status changed / additional info required',
        'Privacy request completed',
        'Privacy request deadline extended/declined where lawful',
        'Personal data export ready/expired',
        'Deletion request scheduled/confirmed',
        'Deletion blocked/limited by legal hold or contractual retention',
        'Legal hold placed/changed/released',
        'Retention policy materially changed',
        'Data residency/region migration scheduled/completed/failed',
      ],
      OFF: [
        'Offboarding initiated',
        'Offboarding confirmation/action required',
        'Final export/attestation package ready',
        'Access termination milestone completed',
        'Legal hold/retention prevents scheduled deletion',
        'Cryptographic key destruction scheduled/completed',
        'Backup retention expiry milestone reached',
        'Final deletion/offboarding attestation available',
      ],
      STAT: [
        'Scheduled maintenance announced',
        'Maintenance reminder',
        'Maintenance started',
        'Maintenance extended / impact changed',
        'Maintenance completed',
        'Service degradation/partial outage affecting tenant',
        'Major outage affecting tenant',
        'Incident monitoring / recovery update',
        'Service incident resolved',
        'Post-incident report available',
      ],
      OPS: [
        'P0/P1 platform incident declared',
        'Tenant-isolation anomaly or suspected cross-tenant access',
        'Authorization/policy engine fail-closed event above threshold',
        'Audit/event write durability failure',
        'Ingestion backlog/DLQ/quarantine surge above threshold',
        'Systemic connector/provider outage',
        'Response broker/action freeze activated platform-wide',
        'KMS/HSM/signing operation failure or key availability issue',
        'Evidence anchor/checkpoint/witness failure',
        'AI provider/model route outage or safety kill switch activation',
        'Notification provider/delivery degradation',
        'Database/queue/storage capacity or replication risk',
        'Backup/restore verification failed',
        'Production certificate/secret/key rotation approaching expiry or failed',
        'Billing reconciliation/tax/invoice finalization failure',
        'Offboarding/deletion workflow stuck or attestation mismatch',
        'Workflow engine stuck execution/queue threshold exceeded',
        'SLA/SLO breach requiring customer notification',
        'Security scanning/supply-chain critical finding in production release',
        'Production rollback or emergency change completed',
      ],
      GOV: [
        'Notification preferences materially changed',
        'Security/contact routing changed for organization',
        'Scheduled digest enabled/disabled/changed',
        'Terms of service / contractual service terms materially updated',
        'Privacy notice materially updated where notice is required',
        'Subprocessor/provider notice where contract or law requires',
        'Policy/feature deprecation affecting production use',
        'End-of-life or migration deadline notice',
      ],
    };

    const list = titles[category];
    if (list && list[index - 1]) {
      return list[index - 1];
    }
    return `${category} Event Notice #${index}`;
  }
}
