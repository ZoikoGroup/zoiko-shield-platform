import { CanonicalContext } from '../interfaces/canonical-context.interface';

export class CreateTenantDto {
  name: string;
  context: CanonicalContext;
}
