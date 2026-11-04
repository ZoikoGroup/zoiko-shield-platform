import { createHash, randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';

export const SESSION_COOKIE = 'zs_pa_sid';
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export interface GuestSession {
  id: string;
  tokenHash: string;
  epoch: number;
  createdAt: number;
  expiresAt: number;
  ipHash: string;
  uaClass: string;
}

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class SessionService {
  private readonly sessions = new Map<string, GuestSession>();
  private readonly byToken = new Map<string, string>();

  create(ip: string, userAgent: string): { session: GuestSession; token: string } {
    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    const session: GuestSession = {
      id: `sess_${randomBytes(9).toString('base64url')}`,
      tokenHash: hash(token),
      epoch: 1,
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
      ipHash: hash(ip || 'unknown').slice(0, 24),
      uaClass: this.classifyUa(userAgent),
    };
    this.sessions.set(session.id, session);
    this.byToken.set(session.tokenHash, session.id);
    this.evictExpired();
    return { session, token };
  }

  resolve(token: string | undefined): GuestSession | undefined {
    if (!token) return undefined;
    const id = this.byToken.get(hash(token));
    if (!id) return undefined;
    const session = this.sessions.get(id);
    if (!session || session.expiresAt <= Date.now()) return undefined;
    return session;
  }

  clear(token: string | undefined): boolean {
    if (!token) return false;
    const tokenHash = hash(token);
    const id = this.byToken.get(tokenHash);
    if (!id) return false;
    const session = this.sessions.get(id);
    if (session) {
      // Bump the epoch so stale stream chunks cannot land in a new conversation.
      session.epoch += 1;
      session.expiresAt = Date.now();
    }
    this.byToken.delete(tokenHash);
    return true;
  }

  private classifyUa(userAgent: string): string {
    const ua = userAgent.toLowerCase();
    if (/mobile|android|iphone/.test(ua)) return 'mobile';
    if (/bot|crawler|spider/.test(ua)) return 'bot';
    return 'desktop';
  }

  private evictExpired() {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (session.expiresAt <= now) {
        this.sessions.delete(id);
        this.byToken.delete(session.tokenHash);
      }
    }
  }
}
