import { randomUUID } from 'crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type FederationProtocol = 'OIDC' | 'SAML';
export type IdentityProviderStatus = 'DRAFT' | 'ACTIVE' | 'DISABLED';
export type OidcClientAuthMethod = 'client_secret_basic' | 'client_secret_post';

export interface PinnedOidcMetadata extends Record<string, unknown> {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  end_session_endpoint?: string;
  scopes_supported?: string[];
  claims_supported?: string[];
  code_challenge_methods_supported?: string[];
  id_token_signing_alg_values_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
  response_types_supported?: string[];
}

@Entity({ name: 'identity_provider_configurations', schema: 'identity' })
@Index(['tenantId', 'name'], { unique: true })
export class IdentityProviderConfiguration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @BeforeInsert()
  generateId() {
    if (!this.id) this.id = randomUUID();
  }

  @Column({ type: 'uuid' })
  @Index()
  tenantId: string;

  @Column({ type: 'uuid' })
  environmentId: string;

  @Column({ length: 160 })
  name: string;

  @Column({ type: 'varchar' })
  protocol: FederationProtocol;

  @Column({ type: 'varchar', default: 'DRAFT' })
  status: IdentityProviderStatus;

  @Column({ type: 'text' })
  issuer: string;

  @Column({ type: 'varchar', nullable: true })
  clientId: string | null;

  // Reference into the runtime secret provider. Secret material is never
  // persisted in this configuration table or returned by the API.
  @Column({ type: 'varchar', nullable: true })
  clientSecretRef: string | null;

  @Column({
    type: 'varchar',
    nullable: true,
  })
  oidcClientAuthMethod: OidcClientAuthMethod | null;

  @Column({ type: 'jsonb', nullable: true })
  oidcMetadata: PinnedOidcMetadata | null;

  @Column({ type: 'varchar', nullable: true })
  oidcSigningAlgorithm: string | null;

  @Column({ type: 'text', nullable: true })
  samlEntryPoint: string | null;

  @Column({ type: 'jsonb', default: [] })
  samlIdpCertificates: string[];

  @Column({ type: 'varchar', nullable: true })
  samlSpEntityId: string | null;

  @Column({ type: 'varchar', nullable: true })
  samlSpPrivateKeyRef: string | null;

  @Column({ type: 'text', nullable: true })
  samlSpPublicCertificate: string | null;

  @Column({ type: 'varchar', default: 'email' })
  emailClaim: string;

  @Column({ type: 'varchar', default: 'name' })
  displayNameClaim: string;

  @Column({ type: 'varchar', nullable: true })
  groupsClaim: string | null;

  @Column({ type: 'jsonb', default: [] })
  mfaClaimValues: string[];

  @Column({ default: false })
  requireMfa: boolean;

  @Column({ type: 'int', default: 120000 })
  allowedClockSkewMs: number;

  @Column({ type: 'varchar', nullable: true })
  metadataHash: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  metadataValidatedAt: Date | null;

  @Column({ type: 'uuid' })
  createdByPrincipalId: string;

  @Column({ type: 'uuid' })
  updatedByPrincipalId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
