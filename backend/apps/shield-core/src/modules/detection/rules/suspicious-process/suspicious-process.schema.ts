export const SUSPICIOUS_PROCESS_KEY = 'ZS-PROC-001';

export interface SuspiciousProcessConfiguration {
  suspiciousProcessNames: string[];
  suspiciousCommandLinePatterns: string[];
  criticalityThreshold: string;
}

export const DEFAULT_SUSPICIOUS_PROCESS_CONFIG: SuspiciousProcessConfiguration = {
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
