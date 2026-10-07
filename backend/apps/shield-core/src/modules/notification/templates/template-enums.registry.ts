/**
 * Template-Side Allowlisted Enums Registry (ZS-EML-TPL-001 v2.0 §1 & §3)
 * Enforces typed, customer-facing allowlisted display labels derived from event-specific enums.
 * Free-form backend text is strictly prohibited in email subject lines and body copy.
 */

export const ALLOWLISTED_STATUS_LABELS: Record<string, string> = {
  // Identity, Authentication & Access (IAM)
  PENDING_VERIFICATION: 'Verification Pending',
  VERIFIED: 'Email Verified',
  EMAIL_CHANGE_REQUESTED: 'Email Change Requested',
  EMAIL_CHANGED: 'Email Changed',
  PASSWORD_RESET_REQUESTED: 'Password Reset Requested',
  PASSWORD_CHANGED: 'Password Changed',
  PASSWORD_RESET_COMPLETED: 'Password Reset Completed',
  MFA_ENABLED: 'MFA Enabled',
  MFA_SETTINGS_CHANGED: 'MFA Settings Changed',
  RECOVERY_SETTINGS_CHANGED: 'Recovery Settings Changed',
  PASSKEY_CHANGED: 'Passkey / Security Key Changed',
  NEW_SIGN_IN_DETECTED: 'New Sign-in Detected',
  SUSPICIOUS_SIGN_IN_BLOCKED: 'Suspicious Sign-in Blocked',
  ACCOUNT_LOCKED: 'Account Temporarily Locked',
  ACCOUNT_RESTORED: 'Account Access Restored',
  SSO_CONFIG_CHANGED: 'SSO Configuration Changed',
  PROVISIONING_CHANGED: 'SCIM / Provisioning Changed',
  PERMISSIONS_CHANGED: 'Permissions Changed',
  PRIVILEGED_ACCESS_CHANGED: 'Privileged Access Changed',
  USER_ACCESS_CHANGED: 'User Access Status Changed',
  SESSIONS_REVOKED: 'Sessions Revoked',
  SERVICE_ACCOUNT_CHANGED: 'Service Account Status Changed',
  IDP_METADATA_EXPIRING: 'IdP Metadata Approaching Expiry',

  // Organization, Tenant & Onboarding (ORG)
  WORKSPACE_READY: 'Workspace Ready',
  INVITATION_SENT: 'Invitation Pending',
  INVITATION_REMINDER: 'Invitation Expiring Soon',
  INVITATION_ACCEPTED: 'Invitation Accepted',
  INVITATION_DECLINED: 'Invitation Declined',
  INVITATION_EXPIRED: 'Invitation Expired',
  OWNER_TRANSFER_REQUESTED: 'Ownership Transfer Requested',
  OWNER_TRANSFER_COMPLETED: 'Ownership Transfer Completed',
  OWNER_TRANSFER_CANCELLED: 'Ownership Transfer Cancelled',
  PROFILE_CHANGED: 'Profile / Legal Entity Changed',
  DOMAIN_VERIFIED: 'Domain Verified',
  DOMAIN_VERIFICATION_FAILED: 'Domain Verification Failed',
  ONBOARDING_ACTION_REQUIRED: 'Onboarding Action Required',
  ONBOARDING_MILESTONE_COMPLETED: 'Onboarding Milestone Completed',
  ONBOARDING_BLOCKED: 'Onboarding Blocked',
  READINESS_APPROVED: 'Production Readiness Approved',
  RESIDENCY_CONFIG_CHANGED: 'Data Residency Changed',

  // Connectors, Ingestion & Telemetry (CONN)
  CONNECTOR_AUTH_COMPLETED: 'Connector Authorized',
  CONNECTOR_AUTH_FAILED: 'Connector Authorization Failed',
  CONNECTOR_DISCONNECTED: 'Connector Disconnected',
  CONNECTOR_CREDENTIAL_EXPIRED: 'Connector Credential Expired',
  CONNECTOR_SCOPE_DRIFT: 'Scope Drift Detected',
  CONNECTOR_DEGRADED: 'Connector Degraded',
  CONNECTOR_HEALTH_RESTORED: 'Connector Healthy',
  INGESTION_DELAYED: 'Ingestion Delayed',
  INGESTION_STOPPED: 'Ingestion Stopped',
  INGESTION_RECOVERED: 'Ingestion Recovered',
  SCHEMA_REJECTION_SURGE: 'Schema Rejection Threshold Exceeded',
  RATE_LIMITING_ACTIVE: 'Source Rate Limiting Active',
  BACKFILL_STARTED: 'Backfill Started',
  BACKFILL_COMPLETED: 'Backfill Completed',
  BACKFILL_FAILED: 'Backfill Failed',
  CONNECTOR_SECRET_EXPIRING: 'Secret Approaching Expiry',
  CONNECTOR_CONFIG_CHANGED: 'Configuration Changed',

  // Detection, Alerts & Casework (SEC)
  CRITICAL_ALERT_CREATED: 'Critical Alert Requires Review',
  HIGH_ALERT_CREATED: 'High-Severity Alert Requires Review',
  ALERT_ESCALATED: 'Alert Escalated',
  ALERT_DEESCALATED: 'Alert De-escalated',
  ALERT_ASSIGNED: 'Alert Assigned',
  ALERT_ACKNOWLEDGED: 'Alert Acknowledged',
  ALERT_RESOLVED: 'Alert Resolved',
  ALERT_REOPENED: 'Alert Reopened',
  SUPPRESSION_APPROVAL_REQUESTED: 'Suppression Approval Required',
  RULE_CHANGED: 'Detection Rule Changed',
  HUNTING_TASK_ASSIGNED: 'Threat-Hunting Task Assigned',
  HUNTING_RESULT_READY: 'Threat-Hunting Result Ready',
  CASE_CREATED: 'Case Created',
  CASE_ASSIGNED: 'Case Assigned',
  CASE_STATUS_CHANGED: 'Case Status Changed',
  CASE_SLA_APPROACHING: 'Case SLA Approaching Breach',
  CASE_SLA_BREACHED: 'Case SLA Breached',
  CASE_MENTIONED: 'Case Mention Requiring Attention',
  INCIDENT_DECLARED: 'Security Incident Declared',
  INCIDENT_UPDATE_PUBLISHED: 'Incident Stakeholder Update Published',
  INCIDENT_RESOLVED: 'Security Incident Contained / Resolved',
  RCA_READY: 'Post-Incident Review / RCA Ready',

  // Governed Response Actions (ACT)
  RECOMMENDATION_READY: 'Action Recommendation Ready',
  APPROVAL_REQUESTED: 'Action Approval Required',
  SECOND_APPROVAL_REQUESTED: 'Dual-Custody Second Approval Required',
  APPROVAL_EXPIRING: 'Action Approval Window Expiring Soon',
  ACTION_APPROVED: 'Action Approved',
  ACTION_REJECTED: 'Action Rejected',
  ACTION_CANCELLED: 'Action Cancelled',
  ACTION_QUEUED: 'Action Queued for Execution',
  ACTION_SUCCEEDED: 'Action Execution Succeeded',
  ACTION_FAILED: 'Action Execution Failed',
  ROLLBACK_INITIATED: 'Compensating Rollback Initiated',
  ROLLBACK_COMPLETED: 'Compensating Rollback Completed',
  ROLLBACK_FAILED: 'Compensating Rollback Failed',
  ACTION_FREEZE_ACTIVE: 'Response Actions Frozen',
  ACTION_FREEZE_LIFTED: 'Response Action Freeze Lifted',
  PLATFORM_FREEZE_ACTIVE: 'Platform-Wide Freeze Active',
  RECOMMENDATION_ONLY_ACTIVE: 'Recommendation-Only Mode Active',

  // Assurance & Obligations (ASSURE)
  CONTROL_NON_COMPLIANT: 'Control Failing / Non-Compliant',
  CONTROL_DEGRADED: 'Evidence Freshness at Risk',
  CONTROL_RECOVERED: 'Control Acceptable / Recovered',
  CONTROL_OWNER_CHANGED: 'Control Owner Changed',
  CONTROL_REVIEW_DUE: 'Control Review Due',
  CONTROL_REVIEW_OVERDUE: 'Control Review Overdue',
  EVIDENCE_ASSIGNED: 'Evidence Request Assigned',
  EVIDENCE_DUE_SOON: 'Evidence Request Due Soon',
  EVIDENCE_OVERDUE: 'Evidence Request Overdue',
  EVIDENCE_SUBMITTED: 'Evidence Submitted',
  EVIDENCE_ACCEPTED: 'Evidence Accepted',
  EVIDENCE_REJECTED: 'Evidence Rejected',
  OBLIGATION_EVALUATED: 'Obligation Applicability Evaluated',
  OBLIGATION_CHANGED: 'Applicability Change Recorded',
  OBLIGATION_DUE: 'Obligation Review Due',
  OBLIGATION_STATUS_CHANGED: 'Obligation Status Changed',
  PROOF_INVALIDATED: 'Proof / Evidence Invalidated',
  ASSESSMENT_STARTED: 'Assessment Started',
  ASSESSMENT_COMPLETED: 'Assessment Completed',
  ASSESSMENT_FAILED: 'Assessment Failed',
  EXCEPTION_SUBMITTED: 'Exception Request Submitted',
  EXCEPTION_APPROVED: 'Exception Approved',
  EXCEPTION_REJECTED: 'Exception Rejected',
  EXCEPTION_EXPIRING: 'Exception Expiring Soon',
  EXCEPTION_EXPIRED: 'Exception Expired',
  RISK_ITEM_CHANGED: 'Risk Item Status Changed',
  RISK_REVIEW_DUE: 'Risk Review Due / Overdue',
  FRAMEWORK_MAPPING_CHANGED: 'Framework Mapping Changed',
  DIGEST_SCHEDULED: 'Assurance Posture Scheduled Digest',

  // Evidence Ledger & Verification (EVID)
  EVIDENCE_HUMAN_REVIEW_REQUIRED: 'Evidence Requires Human Review',
  EVIDENCE_AGING: 'Evidence Freshness Aging',
  EVIDENCE_STALE: 'Evidence Stale',
  INTEGRITY_VERIFICATION_FAILED: 'Evidence Integrity Verification Failed',
  EVIDENCE_EXPORT_REQUESTED: 'Evidence Export Requested',
  EVIDENCE_EXPORT_READY: 'Evidence Export Ready',
  EVIDENCE_EXPORT_FAILED: 'Evidence Export Failed',
  DOWNLOAD_LINK_EXPIRING: 'Download Link Expiring Soon',
  AUDIT_PACKAGE_GENERATING: 'Audit Package Generation Started',
  AUDIT_PACKAGE_READY: 'Audit Package Ready for Download',
  AUDIT_PACKAGE_FAILED: 'Audit Package Generation Failed',
  AUDITOR_INVITED: 'Auditor Access Granted',
  AUDITOR_REVOKED: 'Auditor Access Revoked',
  MANIFEST_AVAILABLE: 'Offline Package Manifest Available',
  LEGAL_HOLD_APPLIED: 'Legal Hold Prevents Deletion / Export',

  // AI Governance (AI)
  AI_RECOMMENDATION_READY: 'AI Recommendation Ready for Review',
  AI_DECISION_RECORDED: 'AI Review Decision Recorded',
  AI_OUTPUT_BLOCKED: 'AI Output Blocked by Policy Gate',
  AI_USE_CASE_REQUESTED: 'AI Use-Case Approval Requested',
  AI_USE_CASE_APPROVED: 'AI Use-Case Approved',
  AI_USE_CASE_REJECTED: 'AI Use-Case Rejected',
  AI_ROUTE_CHANGED: 'Model Production Route Changed',
  AI_DRIFT_EXCEEDED: 'AI Drift Threshold Exceeded',
  AI_FALLBACK_ACTIVE: 'AI Safe-Degradation Fallback Active',
  AI_RESTORED: 'AI Service Restored to Normal Route',
  AI_INCIDENT_DECLARED: 'AI Incident Formally Declared',
  AI_INCIDENT_RESOLVED: 'AI Incident Resolved',
  AI_TOOL_AUTHORITY_CHANGED: 'AI Tool Authority Changed',

  // API & Webhooks (DEV)
  API_KEY_CREATED: 'API Credential Created',
  API_KEY_EXPIRING: 'API Credential Expiring Soon',
  API_KEY_ROTATED: 'API Credential Rotated',
  API_KEY_REVOKED: 'API Credential Revoked',
  WEBHOOK_CREATED: 'Webhook Endpoint Created',
  WEBHOOK_CHANGED: 'Webhook Configuration Changed',
  WEBHOOK_SECRET_ROTATED: 'Webhook Secret Rotated',
  WEBHOOK_DELIVERY_FAILING: 'Repeated Webhook Delivery Failures',
  WEBHOOK_DELIVERY_RECOVERED: 'Webhook Delivery Recovered',
  API_USAGE_WARNING: 'API Quota Soft Limit Approaching',
  API_QUOTA_REACHED: 'API Hard Limit Reached',
  IP_ALLOWLIST_CHANGED: 'Network Allowlist Changed',
  INTEGRATION_TEST_COMPLETED: 'Integration Certification Passed',

  // Commercial & Billing (BILL)
  SUBSCRIPTION_ACTIVATED: 'Subscription Service Activated',
  PLAN_CHANGED: 'Plan / Entitlement Changed',
  USAGE_SOFT_LIMIT: 'Usage Threshold Soft Limit Warning',
  QUOTA_ENFORCED: 'Hard Entitlement Quota Enforced',
  INVOICE_ISSUED: 'Invoice Available',
  PAYMENT_RECEIVED: 'Payment Received',
  PAYMENT_FAILED: 'Payment Failed',
  PAYMENT_RETRY_SCHEDULED: 'Payment Retry Scheduled',
  PAYMENT_RECOVERED: 'Payment Recovered',
  CREDIT_NOTE_ISSUED: 'Credit Note / Adjustment Issued',
  SLA_CREDIT_APPROVED: 'SLA Service Credit Issued',
  RENEWAL_APPROACHING: 'Subscription Renewal Approaching',
  RENEWAL_COMPLETED: 'Subscription Renewed',
  CANCELLATION_REQUESTED: 'Cancellation Requested',
  CANCELLATION_CONFIRMED: 'Cancellation Confirmed',
  SUSPENSION_WARNING: 'Service Suspension Warning',
  COMMERCIAL_SUSPENSION_ACTIVE: 'Commercial Suspension Applied',
  COMMERCIAL_SUSPENSION_LIFTED: 'Commercial Suspension Lifted',
  TAX_STATEMENT_READY: 'Tax Document Available',

  // Support (SUP)
  SUPPORT_CASE_CREATED: 'Support Case Created',
  SUPPORT_CASE_ASSIGNED: 'Support Case Assigned',
  SUPPORT_AGENT_REPLIED: 'Action Required on Support Case',
  SUPPORT_PRIORITY_ESCALATED: 'Support Case Priority Escalated',
  SUPPORT_SLA_BREACH_RISK: 'Support SLA Approaching Breach',
  SUPPORT_CASE_RESOLVED: 'Support Case Resolved',
  PRIVILEGED_SUPPORT_REQUESTED: 'Privileged Support Access Requested',
  PRIVILEGED_SUPPORT_ENDED: 'Privileged Support Access Ended',
  DIAGNOSTIC_UPLOAD_REQUESTED: 'Secure Diagnostic Upload Requested',
  CSAT_SURVEY_REQUESTED: 'Customer Satisfaction Survey',

  // Privacy & Governance (PRIV / GOV)
  PRIVACY_REQUEST_RECEIVED: 'Privacy Request Received',
  PRIVACY_IDENTITY_REQUIRED: 'Identity Verification Required',
  PRIVACY_INFO_REQUIRED: 'Additional Information Required',
  PRIVACY_COMPLETED: 'Privacy Request Completed',
  PRIVACY_DEADLINE_EXTENDED: 'Privacy Deadline Extended',
  PERSONAL_DATA_EXPORT_READY: 'Personal Data Export Ready',
  DATA_DELETION_SCHEDULED: 'Deletion Request Scheduled',
  DATA_DELETION_CONFIRMED: 'Deletion Request Confirmed',
  RETENTION_POLICY_CHANGED: 'Retention Policy Changed',
  DATA_MIGRATION_SCHEDULED: 'Data Residency Migration Scheduled',
  OFFBOARDING_INITIATED: 'Tenant Offboarding Initiated',
  OFFBOARDING_ACTION_REQUIRED: 'Offboarding Action Required',
  FINAL_ATTESTATION_READY: 'Final Offboarding Attestation Available',
  CRYPTO_KEY_DESTRUCTION_COMPLETE: 'Cryptographic Key Destruction Completed',
  SERVICE_DEGRADATION: 'Service Degradation Active',
  SERVICE_OUTAGE: 'Major Outage Active',
  MAINTENANCE_ANNOUNCED: 'Scheduled Maintenance Announced',
  MAINTENANCE_STARTED: 'Maintenance Started',
  MAINTENANCE_COMPLETED: 'Maintenance Completed',
  TERMS_UPDATED: 'Contractual Terms Updated',
  PRIVACY_NOTICE_UPDATED: 'Privacy Notice Updated',
  SUBPROCESSOR_NOTICE: 'Subprocessor Notice Published',
};

export const ALLOWLISTED_ROLE_LABELS: Record<string, string> = {
  ORG_OWNER: 'Organization Owner',
  SECURITY_ADMIN: 'Security Administrator',
  SECURITY_RESPONDER: 'Security Incident Responder',
  COMPLIANCE_OFFICER: 'Compliance & Audit Officer',
  DEVELOPER_ADMIN: 'Developer & API Administrator',
  BILLING_ADMIN: 'Billing Administrator',
  AUDITOR_VIEWER: 'External Auditor (Read-Only)',
  ANALYST_TIER_1: 'SOC Analyst Tier 1',
  ANALYST_TIER_2: 'SOC Analyst Tier 2',
  ANALYST_TIER_3: 'SOC Analyst Tier 3 / Lead',
};

export const ALLOWLISTED_ACTION_TYPE_LABELS: Record<string, string> = {
  REVOKE_GCP_IAM_ROLE: 'Revoke Privileged GCP IAM Roles',
  BLOCK_CLOUD_ARMOR_IP: 'Insert GCP Cloud Armor Edge Deny Rule',
  SUSPEND_WORKSPACE_USER: 'Suspend Google Workspace User Account',
  ROTATE_SERVICE_ACCOUNT_KEY: 'Rotate Service Account Key',
  FREEZE_TENANT_CONTAINMENT: 'Activate Tenant-Wide Response Action Freeze',
  ISOLATE_KUBERNETES_NAMESPACE: 'Isolate Kubernetes Workload Namespace',
};

/**
 * Resolves an allowlisted status label with fail-safe fallback.
 */
export function resolveAllowlistedStatus(rawStatus: string): string {
  if (!rawStatus) return 'Active';
  const normalized = rawStatus.toUpperCase().replace(/[\s-]/g, '_');
  return ALLOWLISTED_STATUS_LABELS[normalized] || formatSafeFallback(rawStatus);
}

/**
 * Resolves an allowlisted role label with fail-safe fallback.
 */
export function resolveAllowlistedRole(rawRole: string): string {
  if (!rawRole) return 'Standard Member';
  const normalized = rawRole.toUpperCase().replace(/[\s-]/g, '_');
  return ALLOWLISTED_ROLE_LABELS[normalized] || formatSafeFallback(rawRole);
}

/**
 * Resolves an allowlisted action type label with fail-safe fallback.
 */
export function resolveAllowlistedActionType(rawAction: string): string {
  if (!rawAction) return 'Governed Response Action';
  const normalized = rawAction.toUpperCase().replace(/[\s-]/g, '_');
  return (
    ALLOWLISTED_ACTION_TYPE_LABELS[normalized] || formatSafeFallback(rawAction)
  );
}

function formatSafeFallback(str: string): string {
  return str
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}
