import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// §7.2 Tenant lifecycle. PROVISIONING is the only state a tenant is created
// in; onboarding activates it in the same transaction that creates it.
export type TenantStatus =
  | 'PROVISIONING'
  | 'ACTIVE'
  | 'RESTRICTED'
  | 'SUSPENDED'
  | 'OFFBOARDING'
  | 'CLOSED';

@Entity({ name: 'tenants', schema: 'tenant' })
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  slug: string;

  @Column({ type: 'varchar', default: 'PROVISIONING' })
  status: TenantStatus;

  @Column()
  homeRegion: string;

  @Column()
  dataResidencyRegion: string;

  @Column()
  timezone: string;

  @Column({ type: 'timestamptz', nullable: true })
  onboardingCompletedAt: Date | null;

  @Column({ type: 'uuid' })
  createdByPrincipalId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
