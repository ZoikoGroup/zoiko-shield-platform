import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'identity_events', schema: 'identity' })
export class IdentityEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  eventType: string;

  @Column({ default: 'identity-adapter' })
  source: string;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  principalId: string | null;

  @Column({ type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({ type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ type: 'uuid', nullable: true })
  correlationId: string | null;

  @Column({ type: 'jsonb', default: {} })
  data: Record<string, unknown>;

  @CreateDateColumn()
  occurredAt: Date;
}
