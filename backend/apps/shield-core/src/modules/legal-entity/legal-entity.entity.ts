import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'legal_entities', schema: 'tenant' })
export class LegalEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  tenantId: string;

  @Column()
  legalName: string;

  @Column({ type: 'varchar', nullable: true })
  registrationNumber?: string;

  @Column({ type: 'varchar', nullable: true })
  countryOfRegistration?: string;

  @Column({ type: 'text', nullable: true })
  registeredAddress?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
