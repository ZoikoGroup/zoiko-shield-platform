import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'saml_request_cache', schema: 'identity' })
export class SamlRequestCacheEntry {
  @PrimaryColumn({ type: 'varchar' })
  keyHash: string;

  @Column({ type: 'text' })
  value: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
