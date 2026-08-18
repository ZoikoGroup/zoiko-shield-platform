import { randomUUID } from 'crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type ChallengePurpose = 'PASSWORD_RECOVERY';
export type ChallengeStatus = 'PENDING' | 'CONSUMED' | 'EXPIRED' | 'LOCKED';

@Entity({ name: 'verification_challenges', schema: 'identity' })
export class VerificationChallenge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = randomUUID();
    }
  }

  @Column({ type: 'uuid' })
  @Index()
  principalId: string;

  @Column({ type: 'varchar' })
  purpose: ChallengePurpose;

  @Column()
  destination: string;

  @Column({ type: 'text' })
  secretHash: string;

  @Column({ type: 'int', default: 0 })
  attemptCount: number;

  @Column({ type: 'int', default: 5 })
  maxAttempts: number;

  @Column({ type: 'timestamptz' })
  resendAfter: Date;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  consumedAt: Date | null;

  @Column({ type: 'varchar', default: 'PENDING' })
  status: ChallengeStatus;

  @Column({ type: 'uuid' })
  correlationId: string;

  @Column({ type: 'varchar', nullable: true })
  requestIp?: string;

  @Column({ type: 'text', nullable: true })
  requestUserAgent?: string;

  @CreateDateColumn()
  createdAt: Date;
}
