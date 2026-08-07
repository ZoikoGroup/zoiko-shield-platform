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

export type MembershipStatus = 'ACTIVE' | 'SUSPENDED' | 'REMOVED';

@Entity({ name: 'tenant_memberships', schema: 'authorization' })
@Index(['tenantId', 'userId'], { unique: true })
export class TenantMembership {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', default: 'ACTIVE' })
  status: MembershipStatus;

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
