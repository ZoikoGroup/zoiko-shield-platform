import { Cron, CronExpression } from '@nestjs/schedule';
import { SCHEDULE_CRON_OPTIONS } from '@nestjs/schedule/dist/schedule.constants';
import { BadRequestException } from '@nestjs/common';
import {
  PlatformScope,
  bindRequestTenant,
  currentDbScope,
  elevateRequestToPlatform,
  runInRequestScope,
  runWithPlatformScope,
  runWithTenantScope,
  sessionSettingsForCurrentScope,
} from './db-scope';
import { bindWorkloadRequestTenant } from './workload-tenant';

describe('database scope', () => {
  it('is fail-closed outside any scope', () => {
    expect(currentDbScope()).toBeUndefined();
    expect(sessionSettingsForCurrentScope()).toEqual({
      tenantId: '',
      platform: false,
      reason: '',
    });
  });

  it('scopes a unit of work to one tenant, across awaits', async () => {
    const seen = await runWithTenantScope('tenant-a', async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return sessionSettingsForCurrentScope();
    });
    expect(seen).toEqual({ tenantId: 'tenant-a', platform: false, reason: '' });
  });

  it('keeps concurrent tenant scopes apart', async () => {
    const read = (tenant: string) =>
      runWithTenantScope(tenant, async () => {
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 5));
        return sessionSettingsForCurrentScope().tenantId;
      });
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) => read(`tenant-${i % 5}`)),
    );
    results.forEach((tenant, i) => expect(tenant).toBe(`tenant-${i % 5}`));
  });

  it('refuses a tenant scope without a tenant', () => {
    expect(() => runWithTenantScope('  ', () => undefined)).toThrow(
      /needs a tenant identifier/,
    );
  });

  it('requires a stated reason for platform scope', () => {
    expect(() => runWithPlatformScope('', () => undefined)).toThrow(
      /stated reason/,
    );
    expect(
      runWithPlatformScope('outbox publishing', () =>
        sessionSettingsForCurrentScope(),
      ),
    ).toEqual({ tenantId: '', platform: true, reason: 'outbox publishing' });
  });

  describe('request scope', () => {
    it('is unscoped until a guard binds the verified tenant', () => {
      runInRequestScope(() => {
        expect(sessionSettingsForCurrentScope().tenantId).toBe('');
        bindRequestTenant('tenant-a');
        expect(sessionSettingsForCurrentScope().tenantId).toBe('tenant-a');
      });
    });

    it('cannot be rebound to a different tenant', () => {
      runInRequestScope(() => {
        bindRequestTenant('tenant-a');
        bindRequestTenant('tenant-a');
        expect(() => bindRequestTenant('tenant-b')).toThrow(
          /already bound to a different tenant/,
        );
      });
    });

    it('is elevated to platform scope only explicitly, with a reason', () => {
      runInRequestScope(() => {
        bindRequestTenant('00000000-0000-0000-0000-000000000000');
        elevateRequestToPlatform('platform-permission:platform:tenant:onboard');
        expect(sessionSettingsForCurrentScope()).toEqual({
          tenantId: '',
          platform: true,
          reason: 'platform-permission:platform:tenant:onboard',
        });
      });
    });

    it('binding outside a request is a no-op, never a leak into later work', () => {
      bindRequestTenant('tenant-a');
      expect(currentDbScope()).toBeUndefined();
    });
  });

  describe('bindWorkloadRequestTenant', () => {
    const request = (parts: Record<string, unknown>) => ({
      headers: {},
      params: {},
      query: {},
      body: {},
      ...parts,
    });

    it('binds the one tenant the calling service named', () => {
      runInRequestScope(() => {
        const tenant = bindWorkloadRequestTenant(
          request({
            headers: { 'x-tenant-id': 'tenant-a' },
            body: { tenantId: 'tenant-a' },
          }),
        );
        expect(tenant).toBe('tenant-a');
        expect(sessionSettingsForCurrentScope().tenantId).toBe('tenant-a');
      });
    });

    it('rejects conflicting tenant identifiers', () => {
      runInRequestScope(() => {
        expect(() =>
          bindWorkloadRequestTenant(
            request({
              headers: { 'x-tenant-id': 'tenant-a' },
              body: { tenantId: 'tenant-b' },
            }),
          ),
        ).toThrow(BadRequestException);
      });
    });

    it('leaves a request that names no tenant unscoped', () => {
      runInRequestScope(() => {
        expect(bindWorkloadRequestTenant(request({}))).toBeUndefined();
        expect(sessionSettingsForCurrentScope().tenantId).toBe('');
      });
    });
  });

  describe('@PlatformScope', () => {
    class Job {
      @PlatformScope('scheduled job Job.sweepAbove')
      @Cron(CronExpression.EVERY_MINUTE)
      sweepAbove() {
        return sessionSettingsForCurrentScope();
      }

      @Cron(CronExpression.EVERY_HOUR)
      @PlatformScope('scheduled job Job.sweepBelow')
      sweepBelow() {
        return sessionSettingsForCurrentScope();
      }
    }

    it('runs the method in platform scope', () => {
      expect(new Job().sweepAbove()).toEqual({
        tenantId: '',
        platform: true,
        reason: 'scheduled job Job.sweepAbove',
      });
      expect(new Job().sweepBelow().platform).toBe(true);
    });

    it('keeps the @Cron registration whichever order the decorators are in', () => {
      expect(
        Reflect.getMetadata(SCHEDULE_CRON_OPTIONS, Job.prototype.sweepAbove),
      ).toEqual(
        expect.objectContaining({ cronTime: CronExpression.EVERY_MINUTE }),
      );
      expect(
        Reflect.getMetadata(SCHEDULE_CRON_OPTIONS, Job.prototype.sweepBelow),
      ).toEqual(
        expect.objectContaining({ cronTime: CronExpression.EVERY_HOUR }),
      );
    });
  });
});

describe('lazy thenables (Prisma queries)', () => {
  it("starts a returned thenable inside the scope, not at the caller's await", async () => {
    // Mimics a PrismaPromise: nothing runs until .then() is called.
    const lazyQuery = () => ({
      then(resolve: (value: string) => void) {
        resolve(sessionSettingsForCurrentScope().tenantId);
      },
    });
    await expect(runWithTenantScope('tenant-a', lazyQuery)).resolves.toBe(
      'tenant-a',
    );
    await expect(
      runWithPlatformScope('lazy platform read', () => ({
        then(resolve: (value: boolean) => void) {
          resolve(sessionSettingsForCurrentScope().platform);
        },
      })),
    ).resolves.toBe(true);
  });
});
