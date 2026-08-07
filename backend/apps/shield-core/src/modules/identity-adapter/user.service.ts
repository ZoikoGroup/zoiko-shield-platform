import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  findByTenantAndEmail(tenantId: string, email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { tenantId, email } });
  }

  findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  create(data: {
    tenantId: string;
    email: string;
    passwordHash: string;
    roles: string[];
  }): Promise<User> {
    const user = this.userRepository.create({
      ...data,
      status: 'active',
    });
    return this.userRepository.save(user);
  }
}
