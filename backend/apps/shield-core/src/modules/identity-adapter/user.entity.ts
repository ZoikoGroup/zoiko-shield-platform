import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AuthenticationProvider = 'LOCAL' | 'GOOGLE' | 'MICROSOFT';
export type UserStatus = 'ACTIVE' | 'DISABLED';

@Entity({ name: 'users', schema: 'identity' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  fullName?: string;

  @Column({ type: 'text', nullable: true })
  passwordHash: string | null;

  @Column({ type: 'text', nullable: true })
  avatarUrl?: string;

  @Column({ type: 'varchar', default: 'LOCAL' })
  authenticationProvider: AuthenticationProvider;

  @Column({ type: 'varchar', nullable: true })
  providerUserId: string | null;

  @Column({ default: false })
  emailVerified: boolean;

  @Column({ type: 'varchar', default: 'ACTIVE' })
  status: UserStatus;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
