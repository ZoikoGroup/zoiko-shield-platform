import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'local_credentials', schema: 'identity' })
export class LocalCredential {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  principalId: string;

  @Column({ type: 'text' })
  passwordHash: string;

  @Column({ type: 'timestamptz' })
  passwordUpdatedAt: Date;

  @Column({ type: 'int', default: 0 })
  failedAttempts: number;

  @Column({ type: 'timestamptz', nullable: true })
  lockedUntil: Date | null;

  @Column({ default: false })
  mustChangePassword: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
