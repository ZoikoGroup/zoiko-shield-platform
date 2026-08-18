import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';
import { FederationProtocol } from './identity-provider-configuration.entity';

@Injectable()
export class FederationRuntimeService {
  constructor(private readonly config: ConfigService) {}

  assertApprovedExternalUrl(value: string, field: string): URL {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new BadRequestException(`${field} must be an absolute URL`);
    }
    const isLocalDevelopment =
      this.config.get<string>('NODE_ENV') !== 'production' &&
      ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !isLocalDevelopment) {
      throw new BadRequestException(`${field} must use HTTPS`);
    }
    if (url.username || url.password || url.hash) {
      throw new BadRequestException(
        `${field} must not contain credentials or a fragment`,
      );
    }

    const allowedHosts = (
      this.config.get<string>('SSO_ALLOWED_IDP_HOSTS') ?? ''
    )
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean);
    if (
      this.config.get<string>('NODE_ENV') === 'production' &&
      (allowedHosts.length === 0 ||
        !allowedHosts.includes(url.hostname.toLowerCase()))
    ) {
      throw new BadRequestException(
        `${field} host is not in SSO_ALLOWED_IDP_HOSTS`,
      );
    }
    return url;
  }

  callbackUrl(protocol: FederationProtocol): string {
    const configured = this.config.get<string>('SSO_PUBLIC_BASE_URL');
    if (!configured && this.config.get<string>('NODE_ENV') === 'production') {
      throw new ServiceUnavailableException(
        'SSO_PUBLIC_BASE_URL is required for federation',
      );
    }
    const base = this.applicationBaseUrl(
      configured ?? 'http://localhost:3001',
      'SSO_PUBLIC_BASE_URL',
    );
    const suffix = protocol === 'OIDC' ? 'oidc/callback' : 'saml/callback';
    return new URL(`/auth/sso/${suffix}`, base).toString();
  }

  applicationRedirect(returnTo = '/'): string {
    if (!/^\/(?!\/)/.test(returnTo)) {
      throw new BadRequestException(
        'returnTo must be an application-relative path',
      );
    }
    const configured = this.config.get<string>('SSO_APP_BASE_URL');
    if (!configured && this.config.get<string>('NODE_ENV') === 'production') {
      throw new ServiceUnavailableException(
        'SSO_APP_BASE_URL is required for federation',
      );
    }
    const base = this.applicationBaseUrl(
      configured ?? 'http://localhost:3000',
      'SSO_APP_BASE_URL',
    );
    return new URL(returnTo, base).toString();
  }

  resolveSecret(reference: string | null | undefined): string | undefined {
    if (!reference) return undefined;
    const injectedSecret = this.config.get<string>(reference);
    if (injectedSecret) return injectedSecret;
    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new ServiceUnavailableException(
        'Required federation secret reference is unavailable',
      );
    }

    // Local-development convenience only. Production secret references must
    // resolve through individually injected secret-manager-backed variables.
    let secrets: Record<string, unknown>;
    try {
      secrets = JSON.parse(
        this.config.get<string>('SSO_SECRET_REFS_JSON', '{}'),
      ) as Record<string, unknown>;
    } catch {
      throw new ServiceUnavailableException(
        'Federation secret provider configuration is invalid',
      );
    }
    if (!secrets || Array.isArray(secrets) || typeof secrets !== 'object') {
      throw new ServiceUnavailableException(
        'Federation secret provider configuration is invalid',
      );
    }
    const value = secrets[reference];
    if (typeof value !== 'string' || value.length === 0) {
      throw new ServiceUnavailableException(
        'Required federation secret reference is unavailable',
      );
    }
    return value;
  }

  encrypt(payload: Record<string, unknown>): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(payload), 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [iv, tag, ciphertext]
      .map((value) => value.toString('base64url'))
      .join('.');
  }

  decrypt<T extends Record<string, unknown>>(envelope: string): T {
    const parts = envelope.split('.');
    if (parts.length !== 3) {
      throw new BadRequestException('Federation transaction is invalid');
    }
    try {
      const [iv, tag, ciphertext] = parts.map((value) =>
        Buffer.from(value, 'base64url'),
      );
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.encryptionKey(),
        iv,
      );
      decipher.setAuthTag(tag);
      return JSON.parse(
        Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
          'utf8',
        ),
      ) as T;
    } catch {
      throw new BadRequestException('Federation transaction is invalid');
    }
  }

  private encryptionKey(): Buffer {
    const configured = this.config.get<string>(
      'SSO_TRANSACTION_ENCRYPTION_KEY',
    );
    if (!configured && this.config.get<string>('NODE_ENV') === 'production') {
      throw new ServiceUnavailableException(
        'SSO transaction encryption is not configured',
      );
    }
    if (configured && Buffer.byteLength(configured, 'utf8') < 32) {
      throw new ServiceUnavailableException(
        'SSO_TRANSACTION_ENCRYPTION_KEY must contain at least 32 bytes',
      );
    }
    const source =
      configured ??
      `${this.config.getOrThrow<string>('JWT_SECRET')}:sso-transactions`;
    return createHash('sha256').update(source).digest();
  }

  private applicationBaseUrl(value: string, field: string): URL {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new ServiceUnavailableException(`${field} is invalid`);
    }
    if (
      this.config.get<string>('NODE_ENV') === 'production' &&
      url.protocol !== 'https:'
    ) {
      throw new ServiceUnavailableException(
        `${field} must use HTTPS in production`,
      );
    }
    if (url.username || url.password || url.hash) {
      throw new ServiceUnavailableException(
        `${field} must not contain credentials or a fragment`,
      );
    }
    return url;
  }
}
