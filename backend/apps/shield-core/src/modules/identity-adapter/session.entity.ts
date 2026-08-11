import { randomUUID } from 'crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type Assurance =
  | 'PASSWORD'
  | 'PASSWORD_MFA'
  | 'FEDERATED'
  | 'FEDERATED_MFA'
  | 'PASSKEY'
  | 'RECOVERY';

@Entity({ name: 'sessions', schema: 'identity' })
export class Session {
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

  @Column({ type: 'varchar', default: 'PASSWORD' })
  assurance: Assurance;

  @Column({ type: 'text' })
  refreshTokenHash: string;

  // Set once at issuance and carried across rotations of the same login;
  // lets a detected-reuse event revoke every token descended from it.
  @Column({ type: 'uuid' })
  @Index()
  familyId: string;

  @Column({ type: 'varchar', nullable: true })
  deviceName?: string;

  @Column({ type: 'varchar', nullable: true })
  ipAddress?: string;

  @Column({ type: 'text', nullable: true })
  userAgent?: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz' })
  absoluteExpiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  revokedReason: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
