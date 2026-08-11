import { randomUUID } from 'crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type PrincipalType = 'HUMAN' | 'WORKLOAD' | 'CLIENT' | 'CONNECTOR' | 'AGENT';
export type PrincipalStatus = 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';

@Entity({ name: 'principals', schema: 'identity' })
export class Principal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = randomUUID();
    }
  }

  @Column({ type: 'varchar', default: 'HUMAN' })
  principalType: PrincipalType;

  @Column({ type: 'varchar', default: 'ACTIVE' })
  status: PrincipalStatus;

  @Column({ type: 'varchar' })
  source: string;

  @Column({ type: 'varchar', default: 'NORMAL' })
  riskState: string;

  @Column({ type: 'varchar', unique: true, nullable: true })
  email: string | null;

  @Column({ nullable: true })
  fullName?: string;

  @Column({ type: 'text', nullable: true })
  avatarUrl?: string;

  @Column({ default: false })
  emailVerified: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  terminatedAt: Date | null;
}
