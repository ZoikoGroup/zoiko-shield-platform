import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { FederationTransaction } from './federation-transaction.entity';
import { FederationRuntimeService } from './federation-runtime.service';
import { FederationProtocol } from './identity-provider-configuration.entity';

const FEDERATION_TRANSACTION_TTL_MS = 10 * 60 * 1000;

export interface FederationTransactionSecretPayload extends Record<
  string,
  unknown
> {
  nonce?: string;
  pkceCodeVerifier?: string;
  invitationToken?: string;
  accessDisclosureVersion?: string;
  accessDisclosureAcceptedAt?: string;
  returnTo?: string;
}

export interface ConsumedFederationTransaction {
  transaction: FederationTransaction;
  secrets: FederationTransactionSecretPayload;
}

@Injectable()
export class FederationTransactionService {
  constructor(
    @InjectRepository(FederationTransaction)
    private readonly repository: Repository<FederationTransaction>,
    private readonly runtime: FederationRuntimeService,
  ) {}

  async create(input: {
    identityProviderConfigurationId: string;
    tenantId: string;
    environmentId: string;
    protocol: FederationProtocol;
    secrets: FederationTransactionSecretPayload;
    requestIp?: string;
    requestUserAgent?: string;
  }): Promise<string> {
    const state = randomBytes(32).toString('base64url');
    await this.repository.save(
      this.repository.create({
        stateHash: this.hash(state),
        identityProviderConfigurationId: input.identityProviderConfigurationId,
        tenantId: input.tenantId,
        environmentId: input.environmentId,
        protocol: input.protocol,
        encryptedPayload: this.runtime.encrypt(
          input.secrets as Record<string, unknown>,
        ),
        requestIp: input.requestIp ?? null,
        requestUserAgent: input.requestUserAgent ?? null,
        expiresAt: new Date(Date.now() + FEDERATION_TRANSACTION_TTL_MS),
        consumedAt: null,
      }),
    );
    return state;
  }

  async consume(
    state: string,
    expectedProtocol: FederationProtocol,
  ): Promise<ConsumedFederationTransaction> {
    if (!state || state.length > 512) {
      throw new BadRequestException('Federation state is invalid');
    }
    const transaction = await this.repository.findOne({
      where: {
        stateHash: this.hash(state),
        protocol: expectedProtocol,
        consumedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
    });
    if (!transaction) {
      throw new UnauthorizedException(
        'Federation transaction is invalid, expired or already used',
      );
    }
    const consumed = await this.repository.update(
      { id: transaction.id, consumedAt: IsNull() },
      { consumedAt: new Date() },
    );
    if (consumed.affected !== 1) {
      throw new UnauthorizedException(
        'Federation transaction is invalid, expired or already used',
      );
    }
    return {
      transaction,
      secrets: this.runtime.decrypt<FederationTransactionSecretPayload>(
        transaction.encryptedPayload,
      ),
    };
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
