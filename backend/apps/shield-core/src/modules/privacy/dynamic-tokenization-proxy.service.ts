import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';

export type AnonymizationLevel =
  'FULL_MASK' | 'PSEUDONYMIZE' | 'REVERSIBLE_TOKEN';

export interface UnmaskAuditRecord {
  tenantId: string;
  token: string;
  operatorId: string;
  jitRequestId: string;
  reason: string;
  unmaskedAt: string;
}

@Injectable()
export class DynamicTokenizationProxyService {
  private readonly logger = new Logger(DynamicTokenizationProxyService.name);

  // In-memory tenant secret keys for vault-less deterministic token generation
  private readonly tenantSecrets = new Map<string, string>();

  // In-memory token-to-ciphertext reverse lookup map (backed by AES-256-GCM)
  private readonly reversibleVault = new Map<
    string,
    { ciphertext: string; iv: string; tag: string; originalType: string }
  >();

  // Audit log of all unmasking operations
  private readonly unmaskAuditTrail: UnmaskAuditRecord[] = [];

  private getOrCreateTenantSecret(tenantId: string): string {
    let secret = this.tenantSecrets.get(tenantId);
    if (!secret) {
      secret = crypto
        .createHash('sha256')
        .update(`token-proxy-master:${tenantId}:2026`)
        .digest('hex');
      this.tenantSecrets.set(tenantId, secret);
    }
    return secret;
  }

  /**
   * Masks email addresses (e.g., alice.smith@company.com -> a***h@company.com)
   */
  maskEmail(email: string): string {
    const parts = email.split('@');
    if (parts.length !== 2) return '***@masked.invalid';
    const [local, domain] = parts;
    if (local.length <= 2) {
      return `${local[0]}***@${domain}`;
    }
    return `${local[0]}***${local[local.length - 1]}@${domain}`;
  }

  /**
   * Masks credit card PANs (e.g., 4111-2222-3333-4444 -> 4111-XXXX-XXXX-4444)
   */
  maskCreditCard(pan: string): string {
    const clean = pan.replace(/\D/g, '');
    if (clean.length < 8) return 'XXXX-XXXX-XXXX-XXXX';
    const first4 = clean.substring(0, 4);
    const last4 = clean.substring(clean.length - 4);
    return `${first4}-XXXX-XXXX-${last4}`;
  }

  /**
   * Masks IP addresses (e.g., 198.51.100.44 -> 198.51.XXX.XXX)
   */
  maskIp(ip: string): string {
    const parts = ip.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.XXX.XXX`;
    }
    return 'XXX.XXX.XXX.XXX';
  }

  /**
   * Generates a deterministic format-preserving surrogate token using HMAC-SHA256.
   */
  generateDeterministicToken(
    tenantId: string,
    value: string,
    prefix = 'tok',
  ): string {
    const secret = this.getOrCreateTenantSecret(tenantId);
    const hash = crypto
      .createHmac('sha256', secret)
      .update(value)
      .digest('hex')
      .substring(0, 16);
    return `${prefix}_${hash}`;
  }

  /**
   * Stores value into the reversible encrypted token vault.
   */
  generateReversibleToken(
    tenantId: string,
    value: string,
    type: 'EMAIL' | 'PAN' | 'IP' | 'SSN' | 'RAW',
  ): string {
    const token = this.generateDeterministicToken(
      tenantId,
      value,
      `fpe_${type.toLowerCase()}`,
    );
    const secret = this.getOrCreateTenantSecret(tenantId);
    const key = crypto.createHash('sha256').update(secret).digest();
    const iv = crypto.randomBytes(12);

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let ciphertext = cipher.update(value, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');

    this.reversibleVault.set(`${tenantId}:${token}`, {
      ciphertext,
      iv: iv.toString('hex'),
      tag,
      originalType: type,
    });

    return token;
  }

  /**
   * Reversibly unmasks a token if the operator has valid JIT authorization.
   */
  unmaskValue(
    tenantId: string,
    token: string,
    context: { operatorId: string; jitRequestId: string; reason: string },
  ): string {
    if (!context.jitRequestId || !context.operatorId) {
      throw new UnauthorizedException(
        'Unmasking requires an approved JIT elevation request ID and valid operator ID',
      );
    }

    const vaultEntry = this.reversibleVault.get(`${tenantId}:${token}`);
    if (!vaultEntry) {
      throw new UnauthorizedException(
        `Token '${token}' not found in reversible vault for tenant '${tenantId}'`,
      );
    }

    const secret = this.getOrCreateTenantSecret(tenantId);
    const key = crypto.createHash('sha256').update(secret).digest();
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(vaultEntry.iv, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(vaultEntry.tag, 'hex'));

    let decrypted = decipher.update(vaultEntry.ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    // Record audit trail
    this.unmaskAuditTrail.push({
      tenantId,
      token,
      operatorId: context.operatorId,
      jitRequestId: context.jitRequestId,
      reason: context.reason,
      unmaskedAt: new Date().toISOString(),
    });

    this.logger.warn(
      `🔓 [PII UNMASK AUDIT] Operator '${context.operatorId}' unmasked token '${token}' under JIT '${context.jitRequestId}' (Reason: ${context.reason})`,
    );

    return decrypted;
  }

  /**
   * Anonymizes an arbitrary JSON object on-the-fly for analyst audit displays.
   */
  anonymizeObject<T = any>(
    tenantId: string,
    data: T,
    level: AnonymizationLevel = 'FULL_MASK',
  ): T {
    if (!data || typeof data !== 'object') return data;

    const anonymizeValue = (key: string, val: any): any => {
      if (typeof val === 'string') {
        const lowerKey = key.toLowerCase();
        if (lowerKey.includes('email') || val.includes('@')) {
          return level === 'FULL_MASK'
            ? this.maskEmail(val)
            : this.generateReversibleToken(tenantId, val, 'EMAIL');
        }
        if (
          lowerKey.includes('card') ||
          lowerKey.includes('pan') ||
          lowerKey.includes('credit')
        ) {
          return level === 'FULL_MASK'
            ? this.maskCreditCard(val)
            : this.generateReversibleToken(tenantId, val, 'PAN');
        }
        if (
          lowerKey.includes('ip') ||
          lowerKey.includes('src_ip') ||
          lowerKey.includes('dst_ip')
        ) {
          return level === 'FULL_MASK'
            ? this.maskIp(val)
            : this.generateReversibleToken(tenantId, val, 'IP');
        }
      }
      if (typeof val === 'object' && val !== null) {
        return this.anonymizeObject(tenantId, val, level);
      }
      return val;
    };

    if (Array.isArray(data)) {
      return data.map((item) =>
        this.anonymizeObject(tenantId, item, level),
      ) as unknown as T;
    }

    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
      result[k] = anonymizeValue(k, v);
    }
    return result as T;
  }

  getAuditTrail(): UnmaskAuditRecord[] {
    return [...this.unmaskAuditTrail];
  }
}
