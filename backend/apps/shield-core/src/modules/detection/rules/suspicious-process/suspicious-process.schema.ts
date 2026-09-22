export const SUSPICIOUS_PROCESS_KEY = 'ZS-PROC-001';

export interface SuspiciousProcessConfiguration {
  suspiciousProcessNames: string[];
  suspiciousCommandLinePatterns: string[];
  criticalityThreshold: string;
}

export const DEFAULT_SUSPICIOUS_PROCESS_CONFIG: SuspiciousProcessConfiguration =
  {
    suspiciousProcessNames: [
      'mimikatz.exe',
      'procdump.exe',
      'lsass.exe',
      'rubeus.exe',
      'psexec.exe',
    ],
    suspiciousCommandLinePatterns: [
      'sekurlsa::logonpasswords',
      'powershell -enc',
      'downloadstring',
      'Invoke-Expression',
      'IEX',
    ],
    criticalityThreshold: 'HIGH',
  };

/** Event classes SuspiciousProcessRule can act on (see its `appliesTo` check). */
export const SUSPICIOUS_PROCESS_REQUIRED_EVENT_TYPES = ['PROCESS_ACTIVITY'];
export const SUSPICIOUS_PROCESS_REQUIRED_FIELDS = ['action', 'occurred_at'];
export const SUSPICIOUS_PROCESS_REQUIRED_CONTEXT = ['asset'];
