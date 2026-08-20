import { Test, TestingModule } from '@nestjs/testing';
import { SyslogTlsProvider } from './syslog-tls.provider';
import { SyslogTlsNormalizerService } from './syslog-tls.normalizer';

describe('SyslogTlsProvider & RFC 5424 Normalizer', () => {
  let provider: SyslogTlsProvider;
  let normalizer: SyslogTlsNormalizerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SyslogTlsProvider, SyslogTlsNormalizerService],
    }).compile();

    provider = module.get<SyslogTlsProvider>(SyslogTlsProvider);
    normalizer = module.get<SyslogTlsNormalizerService>(
      SyslogTlsNormalizerService,
    );
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
    expect(normalizer).toBeDefined();
  });

  it('parses valid RFC 5424 syslog message format', () => {
    const rfc5424Msg =
      '<34>1 2026-08-20T12:00:00.000Z edge-gw-01 sshd 4102 ID47 [exampleSDID@32473 iut="3" eventSource="Application"] Failed password for invalid user admin from 198.51.100.22 port 52344 ssh2';

    const parsed = normalizer.parseRfc5424(rfc5424Msg);

    expect(parsed).not.toBeNull();
    expect(parsed!.priority).toBe(34);
    expect(parsed!.facility).toBe(4); // auth
    expect(parsed!.severity).toBe(2); // critical
    expect(parsed!.hostname).toBe('edge-gw-01');
    expect(parsed!.appName).toBe('sshd');
    expect(parsed!.procId).toBe('4102');
  });

  it('normalizes failed SSH login and extracts user and source IP', () => {
    const rfc5424Msg =
      '<34>1 2026-08-20T12:00:00.000Z edge-gw-01 sshd 4102 ID47 - Failed password for invalid user admin from 198.51.100.22 port 52344 ssh2';

    const parsed = normalizer.parseRfc5424(rfc5424Msg)!;
    const normalized = normalizer.normalizeMessage(
      parsed,
      'tenant-1',
      'env-prod',
      'us-east-1',
    );

    expect(normalized.provider).toBe('syslog-tls');
    expect(normalized.action_type).toBe('AUTH_FAILURE');
    expect(normalized.target_user).toBe('admin');
    expect(normalized.source_ip).toBe('198.51.100.22');
    expect(normalized.host.hostname).toBe('edge-gw-01');
    expect(normalized.raw_payload_hash).toBeDefined();
  });

  it('normalizes successful SSH publickey login', () => {
    const rfc5424Msg =
      '<86>1 2026-08-20T12:05:00.000Z dev-bastion sshd 9912 ID47 - Accepted publickey for devops from 203.0.113.10 port 44122 ssh2';

    const parsed = normalizer.parseRfc5424(rfc5424Msg)!;
    const normalized = normalizer.normalizeMessage(
      parsed,
      'tenant-1',
      'env-prod',
      'us-east-1',
    );

    expect(normalized.action_type).toBe('AUTH_SUCCESS');
    expect(normalized.target_user).toBe('devops');
    expect(normalized.source_ip).toBe('203.0.113.10');
  });
});
