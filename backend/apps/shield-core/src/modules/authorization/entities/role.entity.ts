import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Permission } from './permission.entity';

export type RoleLevel = 'PLATFORM' | 'TENANT';

@Entity({ name: 'roles', schema: 'authorization' })
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Null for platform-level roles; set for tenant-scoped custom roles.
  @Column({ type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ length: 100 })
  code: string;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'varchar' })
  roleLevel: RoleLevel;

  @ManyToMany(() => Permission)
  @JoinTable({
    name: 'role_permissions',
    schema: 'authorization',
    joinColumn: { name: 'role_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'permission_id', referencedColumnName: 'id' },
  })
  permissions: Permission[];

  @CreateDateColumn()
  createdAt: Date;
}
