import { CanonicalContext } from '../interfaces/canonical-context.interface';

export class UpdateTenantDto {
  name?: string;
  status?: 'active' | 'suspended' | 'offboarded';
  context: CanonicalContext; // Context must be provided for audit tracking on update
}
