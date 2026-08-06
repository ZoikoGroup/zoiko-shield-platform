import { CanonicalContext } from '../tenant/interfaces/canonical-context.interface';

export class Customer {
  id: string;
  party_id: string;
  customer_type: string;
  lifecycle_status: string;
  kyc_status: string;
  segment?: string;

  // The context associated with the creation/modification of this record
  context: CanonicalContext;

  createdAt: string;
  updatedAt: string;
}
