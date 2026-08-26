import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  TwoPlaneIsolationGuard,
  PLANE_METADATA_KEY,
} from './two-plane-isolation.guard';

describe('TwoPlaneIsolationGuard (ZS-COM-BILL-001 §3 & QA-01 Separation Doctrine)', () => {
  let guard: TwoPlaneIsolationGuard;
  let reflectorMock: any;

  beforeEach(() => {
    reflectorMock = {
      getAllAndOverride: jest.fn(),
    };
    guard = new TwoPlaneIsolationGuard(reflectorMock as Reflector);
  });

  function createMockContext(
    plane: string | undefined,
    headers: any = {},
    body: any = {},
  ): ExecutionContext {
    reflectorMock.getAllAndOverride.mockReturnValue(plane);
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          headers,
          body,
          path: '/api/v1/commercial/subscriptions/mutate',
        }),
      }),
    } as unknown as ExecutionContext;
  }

  it('allows normal Plane 1 commercial requests from standard commercial callers', () => {
    const ctx = createMockContext(
      'PLANE_1_COMMERCIAL',
      {
        'x-zoiko-source-plane': 'PLANE_1_COMMERCIAL',
      },
      {
        contractId: 'contract-001',
        action: 'RENEW_ANNUAL',
      },
    );

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('blocks unapproved Plane 2 security events from directly mutating Plane 1 commercial subscriptions (§3.2)', () => {
    const ctx = createMockContext(
      'PLANE_1_COMMERCIAL',
      {
        'x-zoiko-source-plane': 'PLANE_2_SECURITY_EVIDENCE',
      },
      {
        contractId: 'contract-001',
        surgeTelemetryCharge: 500.0,
        workOrderAuthorizationApproved: false, // Unapproved
      },
    );

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows Plane 2 security events into Plane 1 only when explicit authorized work order is attached', () => {
    const ctx = createMockContext(
      'PLANE_1_COMMERCIAL',
      {
        'x-zoiko-source-plane': 'PLANE_2_SECURITY_EVIDENCE',
      },
      {
        contractId: 'contract-001',
        workOrderAuthorizationApproved: true, // Approved IR Work Order
        commercialOrderReference: 'order-ir-789',
      },
    );

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('blocks attempt to create commercial money directly from security alertId without approved order', () => {
    const ctx = createMockContext(
      'PLANE_1_COMMERCIAL',
      {},
      {
        sourceAlertId: 'alert-brute-force-999',
        createIncidentInvoiceAmount: 2500.0,
        // Missing commercialOrderReference
      },
    );

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
