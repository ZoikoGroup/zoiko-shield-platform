import { randomUUID } from 'crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type Assurance =
  | 'PASSWORD'
  | 'PASSWORD_MFA'
  | 'FEDERATED'
  | 'FEDERATED_MFA'
  | 'PASSKEY'
  | 'RECOVERY';

export type SessionState = 'ACTIVE' | 'RESTRICTED';

export interface SessionBinding {
  tenantId: string;
  membershipId: string;
  environmentId: string | null;
  region: string;
  authenticationMethod: 'PASSWORD' | 'OIDC' | 'SAML';
  issuer?: string | null;
  policyVersion: string;
  riskState?: string;
  state?: SessionState;
}

@Entity({ name: 'sessions', schema: 'identity' })
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = randomUUID();
    }
  }

  @Column({ type: 'uuid' })
  @Index()
  principalId: string;

  @Column({ type: 'varchar', default: 'PASSWORD' })
  assurance: Assurance;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  tenantId: string | null;

  @Column({ type: 'uuid', nullable: true })
  membershipId: string | null;

  @Column({ type: 'uuid', nullable: true })
  environmentId: string | null;

  @Column({ type: 'varchar', nullable: true })
  region: string | null;

  @Column({ type: 'varchar', nullable: true })
  authenticationMethod: string | null;

  @Column({ type: 'text', nullable: true })
  issuer: string | null;

  @Column({ type: 'varchar', default: 'iam-policy-1.0.0' })
  policyVersion: string;

  @Column({ type: 'varchar', default: 'NORMAL' })
  riskState: string;

  @Column({ type: 'varchar', default: 'ACTIVE' })
  state: SessionState;

  @Column({ type: 'text' })
  refreshTokenHash: string;

  // Set once at issuance and carried across rotations of the same login;
  // lets a detected-reuse event revoke every token descended from it.
  @Column({ type: 'uuid' })
  @Index()
  familyId: string;

  @Column({ type: 'varchar', nullable: true })
  deviceName?: string;

  @Column({ type: 'varchar', nullable: true })
  ipAddress?: string;

  @Column({ type: 'text', nullable: true })
  userAgent?: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz' })
  absoluteExpiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  revokedReason: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
