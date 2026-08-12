import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type CustomerLifecycleStatus = 'ACTIVE' | 'SUSPENDED' | 'OFFBOARDED';
export type CustomerKycStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

@Entity({ name: 'customers', schema: 'tenant' })
export class Customer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  tenantId: string;

  @Column({ type: 'uuid' })
  partyId: string;

  @Column()
  customerType: string;

  @Column({ type: 'varchar', default: 'ACTIVE' })
  lifecycleStatus: CustomerLifecycleStatus;

  @Column({ type: 'varchar', default: 'PENDING' })
  kycStatus: CustomerKycStatus;

  @Column({ type: 'varchar', nullable: true })
  segment?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
