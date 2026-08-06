import { CanonicalContext } from './interfaces/canonical-context.interface';

export class Tenant {
  id: string;
  name: string;
  status: 'active' | 'suspended' | 'offboarded';
  
  // The context associated with the creation/modification of this record
  context: CanonicalContext;
  
  createdAt: string;
  updatedAt: string;
}
