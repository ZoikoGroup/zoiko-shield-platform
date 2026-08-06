import { CanonicalContext } from '../tenant/interfaces/canonical-context.interface';

export class Organization {
  id: string;
  name: string;
  status: string;
  context: CanonicalContext;
  createdAt: string;
  updatedAt: string;
}