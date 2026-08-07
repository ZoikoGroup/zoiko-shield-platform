import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type ExternalIdentityProvider = 'GOOGLE' | 'MICROSOFT';

@Entity({ name: 'external_identities', schema: 'identity' })
@Index(['issuer', 'subject'], { unique: true })
export class ExternalIdentity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  principalId: string;

  @Column()
  issuer: string;

  @Column()
  subject: string;

  @Column({ type: 'varchar' })
  provider: ExternalIdentityProvider;

  @Column({ type: 'jsonb', default: {} })
  claimProfile: Record<string, unknown>;

  @Column({ type: 'varchar', default: 'VERIFIED' })
  verificationState: string;

  @Column({ type: 'timestamptz' })
  lastSyncedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
