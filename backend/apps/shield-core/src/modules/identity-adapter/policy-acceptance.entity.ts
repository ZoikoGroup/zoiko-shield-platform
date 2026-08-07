import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'policy_acceptances', schema: 'identity' })
export class PolicyAcceptance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  principalId: string;

  @Column({ type: 'uuid' })
  policyDocumentId: string;

  @Column({ type: 'varchar', nullable: true })
  ipAddress?: string;

  @Column({ type: 'text', nullable: true })
  userAgent?: string;

  @CreateDateColumn()
  acceptedAt: Date;
}
