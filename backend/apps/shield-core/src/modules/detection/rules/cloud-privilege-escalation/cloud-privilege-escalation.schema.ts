export const CLOUD_PRIVILEGE_ESCALATION_KEY = 'ZS-CLOUD-001';

export interface CloudPrivilegeEscalationConfiguration {
  escalationActions: string[];
  sensitivePolicies: string[];
  severityLevel: string;
}

export const DEFAULT_CLOUD_PRIVILEGE_ESCALATION_CONFIG: CloudPrivilegeEscalationConfiguration = {
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
