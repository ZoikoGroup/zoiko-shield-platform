import { Test, TestingModule } from '@nestjs/testing';
import { RedactionService } from './redaction.service';

describe('RedactionService (Secret & PII Scrubbing)', () => {
  let service: RedactionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RedactionService],
    }).compile();

    service = module.get<RedactionService>(RedactionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('redacts AWS access key IDs', () => {
    const input = 'Error encountered with AWS key AKIAIOSFODNN7EXAMPLE during retrieval';
    const result = service.redact(input);

    expect(result.redactionCount).toBe(1);
    expect(result.redacted).toBe('Error encountered with AWS key [REDACTED:AWS_ACCESS_KEY] during retrieval');
    expect(result.redacted).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  it('redacts Bearer authentication tokens', () => {
    const input = 'Authorization header: Bearer ya29.a0AfH6SMD_secret_token_value';
    const result = service.redact(input);

    expect(result.redactionCount).toBe(1);
    expect(result.redacted).toContain('[REDACTED:BEARER_TOKEN]');
    expect(result.redacted).not.toContain('ya29.a0AfH6SMD_secret_token_value');
  });

  it('redacts JWT tokens', () => {
    const input = 'Session token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThisSignature';
    const result = service.redact(input);

    expect(result.redactionCount).toBe(1);
    expect(result.redacted).toContain('[REDACTED:JWT]');
    expect(result.redacted).not.toContain('doNotLeakThisSignature');
  });

  it('redacts generic secret and API key assignments', () => {
    const input = 'Config: api_key="sk_live_9928173491823719" and password=SuperSecretPassword123!';
    const result = service.redact(input);

    expect(result.redactionCount).toBeGreaterThanOrEqual(2);
    expect(result.redacted).toContain('[REDACTED:GENERIC_SECRET_ASSIGNMENT]');
    expect(result.redacted).not.toContain('sk_live_9928173491823719');
    expect(result.redacted).not.toContain('SuperSecretPassword123!');
  });

  it('leaves clean prompt text unmodified', () => {
    const input = 'Explain the security impact of ransomware encryption on financial database hosts.';
    const result = service.redact(input);

    expect(result.redactionCount).toBe(0);
    expect(result.redacted).toBe(input);
  });
});
