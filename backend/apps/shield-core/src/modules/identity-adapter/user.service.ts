import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticationProvider, User } from './user.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  findByProvider(provider: AuthenticationProvider, providerUserId: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { authenticationProvider: provider, providerUserId } });
  }

  create(data: {
    email: string;
    fullName?: string;
    passwordHash?: string | null;
    avatarUrl?: string;
    authenticationProvider?: AuthenticationProvider;
    providerUserId?: string | null;
    emailVerified?: boolean;
  }): Promise<User> {
    const user = this.userRepository.create({
      email: data.email,
      fullName: data.fullName,
      passwordHash: data.passwordHash ?? null,
      avatarUrl: data.avatarUrl,
      authenticationProvider: data.authenticationProvider ?? 'LOCAL',
      providerUserId: data.providerUserId ?? null,
      emailVerified: data.emailVerified ?? false,
      status: 'ACTIVE',
    });
    return this.userRepository.save(user);
  }

  async recordLogin(userId: string): Promise<void> {
    await this.userRepository.update({ id: userId }, { lastLoginAt: new Date() });
  }

  async markEmailVerified(userId: string): Promise<void> {
    await this.userRepository.update({ id: userId }, { emailVerified: true });
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.userRepository.update({ id: userId }, { passwordHash });
  }
}
