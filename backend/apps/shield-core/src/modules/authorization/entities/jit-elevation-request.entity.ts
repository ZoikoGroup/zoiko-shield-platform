import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type JitElevationStatus =
  'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'REVOKED';

@Entity({ name: 'jit_elevation_requests', schema: 'authorization' })
@Index(['targetTenantId', 'status'])
@Index(['superAdminPrincipalId', 'targetTenantId'])
export class JitElevationRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  superAdminPrincipalId: string;

  @Column({ type: 'uuid' })
  targetTenantId: string;

  @Column({ type: 'text' })
  statedPurpose: string;

  @Column({ type: 'int', default: 60 })
  requestedDurationMinutes: number;

  @Column({ type: 'varchar', default: 'TENANT_SECURITY_ANALYST' })
  roleCode: string;

  @Column({ type: 'varchar', default: 'PENDING' })
  status: JitElevationStatus;

  @Column({ type: 'uuid', nullable: true })
  approvedByPrincipalId: string | null;

  @Column({ type: 'text', nullable: true })
  rejectionReason: string | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  approvedAt: Date | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  membershipId: string | null;

  @Column({ type: 'varchar', length: 64 })
  customerVisibleAuditLogRef: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
