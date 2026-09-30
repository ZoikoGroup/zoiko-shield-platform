import { Test, TestingModule } from '@nestjs/testing';
import { MsspFleetController } from './mssp-fleet.controller';
import { MsspFleetPostureService } from './mssp-fleet-posture.service';
import { TwoPartyJitSupportService } from './two-party-jit-support.service';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';

describe('MsspFleetController', () => {
  let controller: MsspFleetController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MsspFleetController],
      providers: [MsspFleetPostureService, TwoPartyJitSupportService],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<MsspFleetController>(MsspFleetController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return fleet summary via controller', () => {
    const res = controller.getFleetSummary('partner-mssp-01');

    expect(res.statusCode).toBe(200);
    expect(res.data.msspPartnerId).toBe('partner-mssp-01');
    expect(res.data.totalDelegatedTenants).toBe(3);
  });

  it('should perform isolation audit via controller', () => {
    const res = controller.verifyIsolation('partner-mssp-01');

    expect(res.statusCode).toBe(200);
    expect(res.data.allBoundariesSealed).toBe(true);
    expect(res.data.crossTenantLeakageDetected).toBe(false);
  });

  it('should execute two-party JIT workflow via controller', () => {
    const reqRes = controller.initiateJit('engineer-lead-01', {
      targetTenantId: 'tenant-client-01',
      incidentReference: 'INC-101',
      justification: 'Critical Sev-1 escalation',
      allowedScope: 'READ_ONLY_SECURITY_TELEMETRY',
      durationMinutes: 45,
    });

    expect(reqRes.statusCode).toBe(201);
    const sessionId = reqRes.data.sessionId;

    const appRes = controller.approveCustomerJit('customer-admin-01', {
      sessionId,
      signatureProof: 'sig-cust-admin',
    });

    expect(appRes.statusCode).toBe(200);
    expect(appRes.data.status).toBe('PENDING_PLATFORM_APPROVAL');

    const authRes = controller.authorizePlatformLeadJit('platform-lead-01', {
      sessionId,
      signatureProof: 'sig-platform-lead',
    });

    expect(authRes.statusCode).toBe(200);
    expect(authRes.data.status).toBe('ACTIVE_AUTHORIZED');
    expect(authRes.data.ephemeralAccessToken).toBeDefined();
  });
});
