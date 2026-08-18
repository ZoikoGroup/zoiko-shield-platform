import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type EnvironmentType =
  'PRODUCTION' | 'STAGING' | 'DEVELOPMENT' | 'TEST' | 'SIMULATION';
export type EnvironmentStatus = 'ACTIVE' | 'DISABLED';

@Entity({ name: 'environments', schema: 'tenant' })
export class Environment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  tenantId: string;

  @Column()
  name: string;

  @Column({ type: 'varchar' })
  environmentType: EnvironmentType;

  @Column()
  region: string;

  @Column({ type: 'varchar', default: 'ACTIVE' })
  status: EnvironmentStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
