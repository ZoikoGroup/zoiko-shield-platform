import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'policy_documents', schema: 'identity' })
@Index(['kind', 'version'], { unique: true })
export class PolicyDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  kind: string; // "TERMS_OF_SERVICE" | "PRIVACY_POLICY" | "ACCEPTABLE_USE"

  @Column()
  version: string;

  @Column({ type: 'timestamptz' })
  publishedAt: Date;

  @Column()
  contentHash: string;

  @Column({ default: true })
  active: boolean;
}
