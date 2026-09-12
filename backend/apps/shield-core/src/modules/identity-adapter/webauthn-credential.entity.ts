import { randomUUID } from 'crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * A registered WebAuthn/FIDO2 passkey. The stored public key is the SPKI the
 * authenticator produced at registration; the private key never leaves the
 * authenticator, so a stolen database row cannot be replayed as a login.
 */
@Entity({ name: 'webauthn_credentials', schema: 'identity' })
export class WebauthnCredential {
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

  /** base64url credential id as returned by the authenticator. */
  @Column({ type: 'text', unique: true })
  credentialId: string;

  @Column({ type: 'text' })
  publicKeyPem: string;

  /**
   * Cloned-authenticator detection. Authenticators that do not implement a
   * counter report 0 forever, which is why a 0 count never trips the check.
   */
  @Column({ type: 'bigint', default: 0 })
  signCount: string;

  @Column({ type: 'varchar', nullable: true })
  label: string | null;

  @Column({ type: 'varchar', nullable: true })
  transports: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastUsedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
