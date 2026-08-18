import { randomUUID } from 'crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { FederationProtocol } from './identity-provider-configuration.entity';

@Entity({ name: 'federation_transactions', schema: 'identity' })
export class FederationTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @BeforeInsert()
  generateId() {
    if (!this.id) this.id = randomUUID();
  }

  @Column({ type: 'varchar', unique: true })
  stateHash: string;

  @Column({ type: 'uuid' })
  @Index()
  identityProviderConfigurationId: string;

  @Column({ type: 'uuid' })
  @Index()
  tenantId: string;

  @Column({ type: 'uuid' })
  environmentId: string;

  @Column({ type: 'varchar' })
  protocol: FederationProtocol;

  // AES-256-GCM envelope containing nonce, PKCE verifier, optional invitation
  // token, and return path. The key is runtime-injected and not stored here.
  @Column({ type: 'text' })
  encryptedPayload: string;

  @Column({ type: 'varchar', nullable: true })
  requestIp: string | null;

  @Column({ type: 'text', nullable: true })
  requestUserAgent: string | null;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  consumedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
