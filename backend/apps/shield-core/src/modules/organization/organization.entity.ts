import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type OrganizationStatus = 'ACTIVE' | 'DISABLED';

@Entity({ name: 'organizations', schema: 'tenant' })
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  tenantId: string;

  @Column()
  name: string;

  @Column({ type: 'varchar', default: 'ACTIVE' })
  status: OrganizationStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
