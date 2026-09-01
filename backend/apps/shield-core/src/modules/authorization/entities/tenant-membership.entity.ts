import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Role } from './role.entity';

export type MembershipStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REMOVED';

@Entity({ name: 'tenant_memberships', schema: 'authorization' })
@Index(['tenantId', 'principalId'], { unique: true })
export class TenantMembership {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'uuid' })
  principalId: string;

  @Column({ type: 'varchar', default: 'ACTIVE' })
  status: MembershipStatus;

  // "INVITATION" | "SCIM" | "BOOTSTRAP" | "JIT_ELEVATION" — how this membership was established.
  @Column({ type: 'varchar', default: 'INVITATION' })
  source: string;

  @Column({ type: 'timestamp with time zone', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'text', nullable: true })
  elevationPurpose: string | null;

  @Column({ type: 'varchar', nullable: true })
  elevationApprovedBy: string | null;

  @ManyToMany(() => Role)
  @JoinTable({
    name: 'user_roles',
    schema: 'authorization',
    joinColumn: { name: 'membership_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'role_id', referencedColumnName: 'id' },
  })
  roles: Role[];

  @CreateDateColumn()
  joinedAt: Date;
}
