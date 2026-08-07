import { IsString } from 'class-validator';

// Identity, tracing and policy fields (tenantId, correlationId, traceId,
// requestId, policyVersion, recordedAt, ...) are never client-suppliable —
// the server resolves the full CanonicalContext itself. See TenantService.
export class CreateTenantDto {
  @IsString()
  name: string;
}
