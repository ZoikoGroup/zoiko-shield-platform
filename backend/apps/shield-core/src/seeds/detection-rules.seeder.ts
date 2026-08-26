import { Injectable } from '@nestjs/common';

export interface DetectionRuleDefinition {
  ruleId: string;
  name: string;
  category: 'IDENTITY' | 'ENDPOINT' | 'CLOUD_INFRA' | 'NETWORK';
  severity: 'INFORMATIONAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  mitreTactic: string;
  mitreTechnique: string;
  description: string;
  queryTemplate: string;
  triggerThreshold: number;
  timeWindowSeconds: number;
}

@Injectable()
export class DetectionRulesSeeder {
  getCanonicalDetectionRules(): DetectionRuleDefinition[] {
    return [
      {
        ruleId: 'ZS-AUTH-001',
        name: 'Brute Force Authentication Storm',
        category: 'IDENTITY',
        severity: 'HIGH',
        mitreTactic: 'Credential Access (TA0006)',
        mitreTechnique: 'Brute Force: Password Guessing (T1110.001)',
        description: 'Detects 5 or more failed login attempts against a single user account within a 5-minute window.',
        queryTemplate: "SELECT count(*) FROM events WHERE class_uid = 3002 AND status = 'FAILURE' GROUP BY actor.user.email_addr",
        triggerThreshold: 5,
        timeWindowSeconds: 300,
      },
      {
        ruleId: 'ZS-AUTH-002',
        name: 'Impossible Geolocation Travel Velocity',
        category: 'IDENTITY',
        severity: 'CRITICAL',
        mitreTactic: 'Initial Access (TA0001)',
        mitreTechnique: 'Valid Accounts: Cloud Accounts (T1078.004)',
        description: 'Detects consecutive successful logins for the same identity originating from different geographic countries within 30 minutes.',
        queryTemplate: "SELECT * FROM events WHERE class_uid = 3002 AND status = 'SUCCESS' GROUP BY actor.user.email_addr, src_endpoint.location.country",
        triggerThreshold: 2,
        timeWindowSeconds: 1800,
      },
      {
        ruleId: 'ZS-IAM-001',
        name: 'Unauthorized Privilege Escalation Out-of-Hours',
        category: 'CLOUD_INFRA',
        severity: 'HIGH',
        mitreTactic: 'Privilege Escalation (TA0004)',
        mitreTechnique: 'Domain Policy Modification (T1484)',
        description: 'Detects high-privilege IAM role assignments (e.g. Global Admin, AWS AdministratorAccess) executed outside business hours without approved change ticket.',
        queryTemplate: "SELECT * FROM events WHERE category_uid = 3 AND activity_id = 10 AND severity_id >= 3",
        triggerThreshold: 1,
        timeWindowSeconds: 60,
      },
      {
        ruleId: 'ZS-EP-001',
        name: 'Rapid Mass File Renaming (Ransomware Heuristic)',
        category: 'ENDPOINT',
        severity: 'CRITICAL',
        mitreTactic: 'Impact (TA0040)',
        mitreTechnique: 'Data Encrypted for Impact (T1486)',
        description: 'Detects high-frequency file modification/renaming operations exceeding 50 files per second by a non-system process.',
        queryTemplate: "SELECT count(*) FROM events WHERE class_uid = 1007 AND process.file.activity = 'RENAME' GROUP BY device.uid",
        triggerThreshold: 50,
        timeWindowSeconds: 10,
      },
    ];
  }
}
