import {
  Injectable,
  Logger,
  BadRequestException,
  Optional,
  Inject,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { createTransport, Transporter } from 'nodemailer';
import {
  ProductionEmailTemplateEngine,
  EmailRenderInput,
} from './templates/production-email-template.engine';
import { TenantIsolationValidator } from './policies/tenant-isolation-validator.service';
import type { RecipientMembershipResolver } from './policies/recipient-membership-resolver';
import { RECIPIENT_MEMBERSHIP_RESOLVER } from './policies/recipient-membership-resolver';
import {
  SenderClassRouterService,
  SenderClassProfile,
} from './channels/sender-class-router.service';

export type NotificationTemplateCategory =
  | 'USG/UsageThreshold75Percent'
  | 'USG/UsageThreshold90Percent'
  | 'USG/RoamingUsageStarted'
  | 'ORD/ServiceActivationFailed'
  | 'ORD/OrderConfirmation'
  | 'TEN/JurisdictionPackChanged'
  | 'SUP/IncidentUpdate'
  | (string & {});

export interface EmailRecipient {
  email: string;
  name?: string;
  role?: string;
}

export interface SendTransactionalEmailInput {
  tenantId: string;
  templateKey: NotificationTemplateCategory;
  recipients: EmailRecipient[];
  variables: Record<string, any>;
  priority?: 'HIGH' | 'NORMAL' | 'LOW';
  /** Optional custom idempotency key to prevent duplicate email dispatches */
  idempotencyKey?: string;
  /**
   * Opt-in Gate 3 recipient-membership check: reject dispatch if a recipient
   * resolves to a principal who is not an active member of `tenantId`.
   */
  requireRecipientMembership?: boolean;
}

export interface DispatchedEmailReceipt {
  receiptId: string;
  tenantId: string;
  templateKey: string;
  recipientsCount: number;
  subject: string;
  htmlBody: string;
  textBody: string;
  deliveryStatus: 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED';
  contentDigest: string;
  dispatchedAt: string;
  renderHash?: string;
  providerMessageId?: string;
  senderProfile?: {
    fromAddress: string;
    fromDisplayName: string;
    replyTo: string;
  };
  deliveryError?: string;
  retryCount?: number;
}

@Injectable()
export class TransactionalEmailService {
  private readonly logger = new Logger(TransactionalEmailService.name);
  private readonly templateEngine: ProductionEmailTemplateEngine;
  private readonly tenantIsolationValidator: TenantIsolationValidator;
  private readonly recipientMembershipResolver?: RecipientMembershipResolver;
  private readonly senderClassRouter: SenderClassRouterService;
  private transporter: Transporter | null = null;
  private readonly idempotencyLedger = new Map<
    string,
    DispatchedEmailReceipt
  >();

  constructor(
    @Optional() templateEngine?: ProductionEmailTemplateEngine,
    @Optional() tenantIsolationValidator?: TenantIsolationValidator,
    @Optional()
    @Inject(RECIPIENT_MEMBERSHIP_RESOLVER)
    recipientMembershipResolver?: RecipientMembershipResolver,
    @Optional() senderClassRouter?: SenderClassRouterService,
  ) {
    this.templateEngine = templateEngine || new ProductionEmailTemplateEngine();
    this.tenantIsolationValidator =
      tenantIsolationValidator || new TenantIsolationValidator();
    this.recipientMembershipResolver = recipientMembershipResolver;
    this.senderClassRouter =
      senderClassRouter || new SenderClassRouterService();

    this.initializeTransport();
  }

  private initializeTransport(): void {
    const smtpHost = process.env.SMTP_HOST;
    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_APP_PASSWORD || process.env.SMTP_PASS;

    if (smtpHost && emailUser && emailPass) {
      this.transporter = createTransport({
        host: smtpHost,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: emailUser,
          pass: emailPass,
        },
      });
      this.logger.log(
        `TransactionalEmailService initialized with active SMTP transport (${smtpHost}).`,
      );
    } else if (emailUser && emailPass) {
      this.transporter = createTransport({
        service: 'gmail',
        auth: {
          user: emailUser,
          pass: emailPass,
        },
      });
      this.logger.log(
        `TransactionalEmailService initialized with active Gmail transport (${emailUser}).`,
      );
    } else {
      this.logger.log(
        'TransactionalEmailService: No SMTP credentials configured — operating in structured dev/ledger mode.',
      );
    }
  }

  /**
   * Renders and dispatches a transactional email based on pre-compiled enterprise email templates.
   */
  async dispatchTransactionalEmail(
    input: SendTransactionalEmailInput,
  ): Promise<DispatchedEmailReceipt> {
    if (!input.recipients || input.recipients.length === 0) {
      throw new BadRequestException('At least one email recipient is required');
    }

    // Enforce Gate 3 Tenant Boundary & URL Isolation across all recipients
    for (const recipient of input.recipients) {
      this.tenantIsolationValidator.validateTenantBoundary({
        tenantId: input.tenantId,
        recipientEmail: recipient.email,
        resourceTenantId:
          input.variables.resourceTenantId ||
          input.variables.resource_tenant_id,
        ctaUrl:
          input.variables.actionUrl ||
          input.variables.action_url ||
          input.variables.security_object_url ||
          input.variables.onboardingUrl ||
          input.variables.onboarding_url,
      });
    }

    // Opt-in Gate 3 recipient-membership check (see SendTransactionalEmailInput.requireRecipientMembership).
    if (input.requireRecipientMembership) {
      if (!this.recipientMembershipResolver) {
        // Asked for a check this instance cannot perform. Failing closed and
        // loudly here is safer than silently dispatching unchecked: a caller
        // that requires this guarantee should find out immediately that its
        // DI wiring is missing the resolver, not months later in an audit.
        throw new BadRequestException(
          'Gate 3 recipient-membership check was requested but no RecipientMembershipResolver is configured.',
        );
      }
      for (const recipient of input.recipients) {
        const safe = await this.recipientMembershipResolver.isSafeRecipient(
          input.tenantId,
          recipient.email,
        );
        if (!safe) {
          this.logger.error(
            `[P0 SECURITY DEFECT] Cross-tenant recipient blocked! Tenant: ${input.tenantId}, recipient resolves to a principal with no active membership in this tenant.`,
          );
          throw new BadRequestException(
            'Tenant isolation boundary violation: Recipient is a known principal with no active membership in the target tenant.',
          );
        }
      }
    }

    const firstRecipient = input.recipients[0];
    let subject: string;
    let htmlBody: string;
    let textBody: string;
    let renderHash: string | undefined;
    let senderClass: string = 'account_sender';

    // Check if the template key is one of the 226 ZS-EML-* production templates
    if (
      input.templateKey.startsWith('ZS-EML-') &&
      this.templateEngine.hasTemplate(input.templateKey)
    ) {
      const renderInput: EmailRenderInput = {
        templateId: input.templateKey,
        recipientFirstName:
          firstRecipient.name ||
          input.variables.recipientFirstName ||
          input.variables.recipient_first_name ||
          (firstRecipient.email
            ? firstRecipient.email.split('@')[0]
            : 'Security Operator'),
        organizationName:
          input.variables.organizationName ||
          input.variables.organization_name ||
          input.variables.tenantName ||
          input.variables.tenant_name ||
          'Enterprise Tenant',
        referenceId:
          input.variables.referenceId ||
          input.variables.reference_id ||
          `ref-${Date.now().toString(36)}`,
        statusLabel:
          input.variables.statusLabel ||
          input.variables.status_label ||
          'ACTIVE',
        occurredAtLocal:
          input.variables.occurredAtLocal ||
          input.variables.occurred_at_local ||
          new Date().toLocaleString(),
        timezone: input.variables.timezone || 'UTC',
        dueAtLocal: input.variables.dueAtLocal || input.variables.due_at_local,
        actorDisplayName:
          input.variables.actorDisplayName ||
          input.variables.actor_display_name,
        objectDisplayReference:
          input.variables.objectDisplayReference ||
          input.variables.object_display_reference,
        actionUrl: input.variables.actionUrl || input.variables.action_url,
        accountSecurityUrl:
          input.variables.accountSecurityUrl ||
          input.variables.account_security_url,
        auditUrl: input.variables.auditUrl || input.variables.audit_url,
        billingUrl: input.variables.billingUrl || input.variables.billing_url,
        supportUrl: input.variables.supportUrl || input.variables.support_url,
        onboardingUrl:
          input.variables.onboardingUrl || input.variables.onboarding_url,
        developerUrl:
          input.variables.developerUrl || input.variables.developer_url,
        governanceUrl:
          input.variables.governanceUrl || input.variables.governance_url,
        verificationUrl:
          input.variables.verificationUrl || input.variables.verification_url,
        passwordResetUrl:
          input.variables.passwordResetUrl ||
          input.variables.password_reset_url,
        downloadUrl:
          input.variables.downloadUrl || input.variables.download_url,
        tokenExpiresAtLocal:
          input.variables.tokenExpiresAtLocal ||
          input.variables.token_expires_at_local ||
          input.variables.invitation_expires_at_local,
        extraVariables: input.variables,
      };

      const rendered = this.templateEngine.render(renderInput);
      subject = rendered.subject;
      htmlBody = rendered.htmlBody;
      textBody = rendered.plainTextBody;
      renderHash = rendered.renderHash;
      senderClass = rendered.senderClass;
    } else {
      // Legacy fallback template renderer
      const renderedLegacy = this.renderLegacyTemplate(
        input.templateKey,
        input.variables,
      );
      subject = renderedLegacy.subject;
      htmlBody = renderedLegacy.htmlBody;
      textBody = renderedLegacy.textBody;
      senderClass = 'account_sender';
    }

    const senderProfile = this.senderClassRouter.resolveSenderProfile(
      senderClass as any,
    );

    const idempotencyKey =
      input.idempotencyKey ||
      `${input.tenantId}:${input.templateKey}:${input.variables.referenceId || ''}:${firstRecipient.email}`;

    if (this.idempotencyLedger.has(idempotencyKey)) {
      const cached = this.idempotencyLedger.get(idempotencyKey)!;
      this.logger.log(
        `[IDEMPOTENT DISPATCH] Returning cached receipt ${cached.receiptId} for key: ${idempotencyKey}`,
      );
      return cached;
    }

    const receiptId = `ntf-rcpt-${crypto.randomUUID()}`;
    const contentDigest = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          tenantId: input.tenantId,
          templateKey: input.templateKey,
          htmlBody,
          recipients: input.recipients,
          renderHash,
        }),
      )
      .digest('hex');

    let providerMessageId: string | undefined;
    let deliveryStatus: 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED' =
      'DELIVERED';
    let deliveryError: string | undefined;
    let retryCount = 0;

    if (this.transporter) {
      const maxRetries = 2;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const info = await this.transporter.sendMail({
            from: `"${senderProfile.fromDisplayName}" <${senderProfile.fromAddress}>`,
            to: input.recipients.map((r) => r.email).join(', '),
            replyTo: senderProfile.replyTo,
            subject,
            html: htmlBody,
            text: textBody,
            headers: {
              'X-ZoikoShield-Tenant': input.tenantId,
              'X-ZoikoShield-Template': input.templateKey,
              'X-ZoikoShield-SenderClass': senderProfile.reputationPool,
            },
          });
          providerMessageId = info.messageId;
          deliveryStatus = 'DELIVERED';
          break;
        } catch (err: any) {
          retryCount = attempt + 1;
          if (attempt < maxRetries) {
            await new Promise((resolve) =>
              setTimeout(resolve, 100 * (attempt + 1)),
            );
          } else {
            this.logger.error(
              `Transactional email delivery failed [${input.templateKey}] to ${input.recipients.map((r) => r.email).join(', ')}: ${err.message}`,
            );
            deliveryStatus = 'FAILED';
            deliveryError = err.message;
          }
        }
      }
    } else {
      providerMessageId = `dev-msg-${crypto.randomUUID()}`;
      deliveryStatus = 'DELIVERED';
    }

    this.logger.log(
      `Dispatched transactional email [${input.templateKey}] (${deliveryStatus}) to ${input.recipients.length} recipients for tenant ${input.tenantId}`,
    );

    const receipt: DispatchedEmailReceipt = {
      receiptId,
      tenantId: input.tenantId,
      templateKey: input.templateKey,
      recipientsCount: input.recipients.length,
      subject,
      htmlBody,
      textBody,
      deliveryStatus,
      contentDigest,
      dispatchedAt: new Date().toISOString(),
      renderHash,
      providerMessageId,
      senderProfile: {
        fromAddress: senderProfile.fromAddress,
        fromDisplayName: senderProfile.fromDisplayName,
        replyTo: senderProfile.replyTo,
      },
      deliveryError,
      retryCount,
    };

    this.idempotencyLedger.set(idempotencyKey, receipt);
    return receipt;
  }

  private renderLegacyTemplate(
    templateKey: string,
    vars: Record<string, any>,
  ): { subject: string; htmlBody: string; textBody: string } {
    switch (templateKey) {
      case 'USG/UsageThreshold75Percent':
        return {
          subject: `⚠️ ZoikoShield Usage Warning: 75% Capacity Reached [${vars.tenantName || 'Enterprise'}]`,
          htmlBody: `<div style="font-family: sans-serif; padding: 20px;"><h2>Usage Warning (75%)</h2><p>Your tenant <strong>${vars.tenantName || vars.tenantId}</strong> has consumed <strong>${vars.consumedGb || 750} GB</strong> of your <strong>${vars.limitGb || 1000} GB</strong> monthly telemetry quota.</p><p>Billing Cycle Reset Date: <strong>${vars.resetDate || 'End of Month'}</strong></p></div>`,
          textBody: `Your tenant has reached 75% of its monthly ingestion quota (${vars.consumedGb || 750} GB / ${vars.limitGb || 1000} GB).`,
        };

      case 'USG/UsageThreshold90Percent':
        return {
          subject: `🚨 CRITICAL USAGE ALERT: 90% Telemetry Limit Consumed [${vars.tenantName || 'Enterprise'}]`,
          htmlBody: `<div style="font-family: sans-serif; padding: 20px;"><h2 style="color: #d97706;">Action Required: 90% Quota Exceeded</h2><p>Tenant <strong>${vars.tenantName}</strong> is approaching hard throttling limits. Current usage: <strong>${vars.consumedGb || 900} GB</strong> / <strong>${vars.limitGb || 1000} GB</strong>.</p><p>Please upgrade your plan to prevent telemetry drop.</p></div>`,
          textBody: `Critical usage alert: Tenant is at 90% quota capacity (${vars.consumedGb || 900} GB / ${vars.limitGb || 1000} GB).`,
        };

      case 'USG/RoamingUsageStarted':
        return {
          subject: `🌐 Cross-Region Telemetry Roaming Ingest Activated [Region: ${vars.region || 'eu-central-1'}]`,
          htmlBody: `<div style="font-family: sans-serif; padding: 20px;"><h2>Cross-Region Roaming Active</h2><p>Telemetry ingest has initiated from auxiliary region <strong>${vars.region}</strong> under connector <strong>${vars.connectorKey}</strong>.</p></div>`,
          textBody: `Cross-region telemetry roaming started in ${vars.region} for connector ${vars.connectorKey}.`,
        };

      case 'ORD/ServiceActivationFailed':
        return {
          subject: `❌ Order Activation Failure: Order #${vars.orderNumber || 'ORD-001'}`,
          htmlBody: `<div style="font-family: sans-serif; padding: 20px;"><h2 style="color: #dc2626;">Service Activation Failed</h2><p>Order <strong>#${vars.orderNumber}</strong> failed automated deployment. Error: <em>${vars.errorMessage || 'KMS Key Provisioning Timeout'}</em>.</p><p>SecOps engineering has been paged automatically.</p></div>`,
          textBody: `Service activation failed for order #${vars.orderNumber}. Error: ${vars.errorMessage || 'KMS Provisioning Timeout'}.`,
        };

      case 'TEN/JurisdictionPackChanged':
        return {
          subject: `📜 Compliance Jurisdiction Updated: [${vars.jurisdiction || 'EU-DORA-2026'}]`,
          htmlBody: `<div style="font-family: sans-serif; padding: 20px;"><h2>Data Residency Pack Updated</h2><p>Tenant compliance jurisdiction has been updated to <strong>${vars.jurisdiction}</strong>. Primary storage region: <strong>${vars.primaryStorageRegion || 'europe-west3'}</strong>.</p></div>`,
          textBody: `Tenant compliance jurisdiction updated to ${vars.jurisdiction}.`,
        };

      case 'SUP/IncidentUpdate':
        return {
          subject: `🛡️ Security Incident Update: [${vars.incidentSeverity || 'CRITICAL'}] ${vars.incidentTitle || 'Threat Containment Action'}`,
          htmlBody: `<div style="font-family: sans-serif; padding: 20px;"><h2>SOC Incident Notification</h2><p>Incident: <strong>${vars.incidentTitle}</strong></p><p>Status: <strong>${vars.incidentStatus || 'CONTAINED'}</strong></p><p>Orchestrated SOAR Action: <code>${vars.remediationAction || 'ISOLATE_ENDPOINT'}</code></p></div>`,
          textBody: `Incident update for ${vars.incidentTitle}: Status is ${vars.incidentStatus || 'CONTAINED'}.`,
        };

      default:
        return {
          subject: `ZoikoShield Notification for Tenant ${vars.tenantId || vars.tenantName || 'Enterprise'}`,
          htmlBody: `<p>ZoikoShield platform notification update.</p>`,
          textBody: `ZoikoShield platform notification update.`,
        };
    }
  }
}
