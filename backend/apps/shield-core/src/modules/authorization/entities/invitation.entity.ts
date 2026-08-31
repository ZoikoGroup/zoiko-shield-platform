import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type InvitationStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'CONSUMED'
  | 'EXPIRED'
  | 'REVOKED';
export type InvitationPurpose = 'TENANT_MEMBERSHIP' | 'OWNER_ACTIVATION';

@Entity({ name: 'invitations', schema: 'authorization' })
export class Invitation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  tokenHash: string;

  @Column({ type: 'uuid' })
  @Index()
  tenantId: string;

  @Column()
  invitedEmail: string;

  @Column({ type: 'uuid' })
  roleId: string;

  @Column({ type: 'uuid' })
  invitedById: string;

  @Column({ type: 'varchar', default: 'TENANT_MEMBERSHIP' })
  purpose: InvitationPurpose;

  @Column({ type: 'uuid', nullable: true })
  invitedPrincipalId: string | null;

  @Column({ type: 'uuid', nullable: true })
  policyDocumentId: string | null;

  @Column({ type: 'varchar', default: 'PENDING' })
  status: InvitationStatus;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  acceptedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  acceptedById: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
