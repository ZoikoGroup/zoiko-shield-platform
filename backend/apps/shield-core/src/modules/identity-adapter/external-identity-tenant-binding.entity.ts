import { randomUUID } from 'crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'external_identity_tenant_bindings', schema: 'identity' })
@Index(['externalIdentityId', 'tenantId'], { unique: true })
export class ExternalIdentityTenantBinding {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @BeforeInsert()
  generateId() {
    if (!this.id) this.id = randomUUID();
  }

  @Column({ type: 'uuid' })
  externalIdentityId: string;

  @Column({ type: 'uuid' })
  @Index()
  tenantId: string;

  @Column({ type: 'uuid' })
  identityProviderConfigurationId: string;

  @Column({ type: 'varchar', default: 'ACTIVE' })
  status: 'ACTIVE' | 'SUSPENDED';

  @Column({ type: 'timestamptz' })
  lastAuthenticatedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
