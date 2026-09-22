import { Principal } from './modules/identity-adapter/principal.entity';
import { LocalCredential } from './modules/identity-adapter/local-credential.entity';
import { ExternalIdentity } from './modules/identity-adapter/external-identity.entity';
import { Session } from './modules/identity-adapter/session.entity';
import { VerificationChallenge } from './modules/identity-adapter/verification-challenge.entity';
import { WebauthnCredential } from './modules/identity-adapter/webauthn-credential.entity';
import { WebauthnChallenge } from './modules/identity-adapter/webauthn-challenge.entity';
import { RecoveryGrant } from './modules/identity-adapter/recovery-grant.entity';
import { PolicyDocument } from './modules/identity-adapter/policy-document.entity';
import { PolicyAcceptance } from './modules/identity-adapter/policy-acceptance.entity';
import { IdentityEvent } from './modules/identity-adapter/identity-event.entity';
import { IdentityProviderConfiguration } from './modules/identity-adapter/identity-provider-configuration.entity';
import { FederationTransaction } from './modules/identity-adapter/federation-transaction.entity';
import { SamlRequestCacheEntry } from './modules/identity-adapter/saml-request-cache.entity';
import { ExternalIdentityTenantBinding } from './modules/identity-adapter/external-identity-tenant-binding.entity';
import { Permission } from './modules/authorization/entities/permission.entity';
import { Role } from './modules/authorization/entities/role.entity';
import { TenantMembership } from './modules/authorization/entities/tenant-membership.entity';
import { Invitation } from './modules/authorization/entities/invitation.entity';
import { JitElevationRequest } from './modules/authorization/entities/jit-elevation-request.entity';
import { Tenant } from './modules/tenant/tenant.entity';
import { LegalEntity } from './modules/legal-entity/legal-entity.entity';
import { Environment } from './modules/environment/environment.entity';
import { Customer } from './modules/customer/customer.entity';
import { Organization } from './modules/organization/organization.entity';

/**
 * Every TypeORM entity shield-core registers, in one place.
 *
 * This list is also what `npm run check:schema-drift` builds a scratch
 * database against, so the hand-written SQL in typeorm-migrations/ can be
 * checked for having fallen behind the entities. Keeping the list inline in
 * the module meant the checker had to keep its own copy, and a copy of a
 * list of entities is exactly the kind of thing that silently goes stale.
 */
export const SHIELD_CORE_TYPEORM_ENTITIES = [
  Principal,
  LocalCredential,
  ExternalIdentity,
  Session,
  VerificationChallenge,
  WebauthnCredential,
  WebauthnChallenge,
  RecoveryGrant,
  PolicyDocument,
  PolicyAcceptance,
  IdentityEvent,
  IdentityProviderConfiguration,
  FederationTransaction,
  SamlRequestCacheEntry,
  ExternalIdentityTenantBinding,
  Permission,
  Role,
  TenantMembership,
  Invitation,
  JitElevationRequest,
  Tenant,
  LegalEntity,
  Environment,
  Customer,
  Organization,
];
