export const CLOUD_PRIVILEGE_ESCALATION_KEY = 'ZS-CLOUD-001';

export interface CloudPrivilegeEscalationConfiguration {
  escalationActions: string[];
  sensitivePolicies: string[];
  severityLevel: string;
}

export const DEFAULT_CLOUD_PRIVILEGE_ESCALATION_CONFIG: CloudPrivilegeEscalationConfiguration =
  {
    escalationActions: [
      'AttachRolePolicy',
      'AttachUserPolicy',
      'PutUserPolicy',
      'PutRolePolicy',
      'CreateAccessKey',
      'AddUserToGroup',
    ],
    sensitivePolicies: [
      'AdministratorAccess',
      'PowerUserAccess',
      'IAMFullAccess',
      '*:*',
    ],
    severityLevel: 'HIGH',
  };

/** Event classes CloudPrivilegeEscalationRule can act on (see its `appliesTo` check). */
export const CLOUD_PRIVILEGE_ESCALATION_REQUIRED_EVENT_TYPES = [
  'CLOUD_AUDIT',
  'SECURITY_FINDING',
];
export const CLOUD_PRIVILEGE_ESCALATION_REQUIRED_FIELDS = [
  'action',
  'occurred_at',
];
export const CLOUD_PRIVILEGE_ESCALATION_REQUIRED_CONTEXT = ['identity'];
