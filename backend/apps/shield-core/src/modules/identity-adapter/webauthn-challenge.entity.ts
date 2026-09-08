import { randomUUID } from 'crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type WebauthnChallengePurpose =
  'REGISTRATION' | 'AUTHENTICATION' | 'STEP_UP';

/**
 * Challenges are persisted rather than held in memory so a replay cannot be
 * retried against a second instance, and so consumption is atomic across the
 * fleet. Single-use and short-lived by construction.
 */
@Entity({ name: 'webauthn_challenges', schema: 'identity' })
export class WebauthnChallenge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = randomUUID();
    }
  }

  /** Null for a usernameless authentication ceremony. */
  @Column({ type: 'uuid', nullable: true })
  @Index()
  principalId: string | null;

  @Column({ type: 'varchar' })
  purpose: WebauthnChallengePurpose;

  /** base64url, as it appears in clientDataJSON.challenge. */
  @Column({ type: 'text' })
  @Index()
  challenge: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  consumedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
