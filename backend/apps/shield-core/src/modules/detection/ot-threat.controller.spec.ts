import { Test, TestingModule } from '@nestjs/testing';
import { OtThreatController } from './ot-threat.controller';
import { OtThreatDetectorService } from './ot-threat-detector.service';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';

describe('OtThreatController', () => {
  let controller: OtThreatController;
  let service: OtThreatDetectorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OtThreatController],
      providers: [OtThreatDetectorService],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<OtThreatController>(OtThreatController);
    service = module.get<OtThreatDetectorService>(OtThreatDetectorService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should get OT rules catalog', () => {
    const res = controller.getRules();
    expect(res.statusCode).toBe(200);
    expect(res.data.totalRules).toBeGreaterThanOrEqual(1);
  });

  it('should analyze OT event and detect unauthorized write', async () => {
    const res = await controller.analyzeEvent(
      '11111111-1111-1111-1111-111111111111',
      {
        eventId: 'evt-test-1',
        timestamp: new Date().toISOString(),
        sourceIp: '192.168.1.50',
        destinationIp: '10.240.10.15',
        destinationPort: 502,
        protocol: 'MODBUS_TCP',
        functionCode: 0x05,
        payloadHex: '0001ff00',
      },
    );

    expect(res.statusCode).toBe(200);
    expect(res.data.threatDetected).toBe(true);
    expect(res.data.finding?.protocol).toBe('MODBUS_TCP');
  });
});
