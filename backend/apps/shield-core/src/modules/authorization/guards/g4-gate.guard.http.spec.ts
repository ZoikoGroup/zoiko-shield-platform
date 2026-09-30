import { Controller, Get, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { G4GateGuard } from './g4-gate.guard';

@UseGuards(G4GateGuard)
@Controller('api/v1/g4-probe')
class G4ProbeController {
  @Get()
  get() {
    return { reached: true };
  }
}

describe('G4GateGuard over HTTP', () => {
  it('returns 403 with the ADR-20 citation instead of reaching the handler', async () => {
    const testingModule = await Test.createTestingModule({
      controllers: [G4ProbeController],
      providers: [G4GateGuard],
    }).compile();
    const app = testingModule.createNestApplication();
    await app.init();

    const response = await request(app.getHttpServer())
      .get('/api/v1/g4-probe')
      .expect(403);

    expect(response.body.message).toMatch(/G4 Sovereign\/OT/);
    expect(response.body.message).toMatch(/ADR-20/);

    await app.close();
  });
});
