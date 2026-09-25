import type { PolicyDocument as PolicyDocumentRow } from '@prisma/client';

/**
 * Row of identity.policy_documents, persisted through Prisma. `kind` is one of
 * "TERMS_OF_SERVICE" | "PRIVACY_POLICY" | "ACCEPTABLE_USE" |
 * "ACCESS_DISCLOSURE".
 */
export type PolicyDocument = PolicyDocumentRow;
