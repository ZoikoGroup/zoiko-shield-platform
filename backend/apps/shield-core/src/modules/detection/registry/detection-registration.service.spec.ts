import { DetectionRegistrationService } from './detection-registration.service';
import { SUSPICIOUS_LOGIN_KEY } from '../rules/suspicious-login/suspicious-login.schema';
import { SUSPICIOUS_PROCESS_KEY } from '../rules/suspicious-process/suspicious-process.schema';
import { CLOUD_PRIVILEGE_ESCALATION_KEY } from '../rules/cloud-privilege-escalation/cloud-privilege-escalation.schema';

describe('DetectionRegistrationService', () => {
  let prisma: any;
  let service: DetectionRegistrationService;

  beforeEach(() => {
    prisma = {
      detectionDefinition: {
        upsert: jest
          .fn()
          .mockImplementation(({ where }: any) =>
            Promise.resolve({ id: `def-${where.key}`, key: where.key }),
          ),
      },
      detectionVersion: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }: any) => Promise.resolve(data)),
      },
    };
    service = new DetectionRegistrationService(prisma);
  });

  it('publishes every implemented rule so findApplicable can return something', async () => {
    await service.onModuleInit();

    const keys = prisma.detectionDefinition.upsert.mock.calls.map(
      ([args]: any[]) => args.where.key,
    );
    expect(keys).toEqual([
      SUSPICIOUS_LOGIN_KEY,
      SUSPICIOUS_PROCESS_KEY,
      CLOUD_PRIVILEGE_ESCALATION_KEY,
    ]);

    // PUBLISHED, not DRAFT — findApplicable only queries published versions.
    expect(prisma.detectionVersion.create).toHaveBeenCalledTimes(3);
    for (const [args] of prisma.detectionVersion.create.mock.calls) {
      expect(args.data.status).toBe('PUBLISHED');
      expect(JSON.parse(args.data.required_event_types).length).toBeGreaterThan(
        0,
      );
    }
  });

  it('never rewrites a version that is already published', async () => {
    prisma.detectionVersion.findFirst.mockResolvedValue({
      id: 'v-1',
      version: 1,
    });

    await service.onModuleInit();

    expect(prisma.detectionVersion.create).not.toHaveBeenCalled();
  });

  it('keeps starting when one detection fails to register, and says which is off', async () => {
    const logged = jest
      .spyOn((service as any).logger, 'error')
      .mockImplementation(() => undefined);
    prisma.detectionVersion.create
      .mockRejectedValueOnce(new Error('unique constraint'))
      .mockImplementation(({ data }: any) => Promise.resolve(data));

    await expect(service.onModuleInit()).resolves.toBeUndefined();

    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining(SUSPICIOUS_LOGIN_KEY),
    );
    // The other two still registered.
    expect(prisma.detectionVersion.create).toHaveBeenCalledTimes(3);
  });
});
