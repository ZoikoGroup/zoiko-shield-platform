import { Reflector } from '@nestjs/core';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PERMISSIONS_KEY } from '../authorization/decorators/require-permissions.decorator';
import { PERMISSION_CODES } from '../authorization/constants';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { EmailSecurityController } from './email-security.controller';

describe('EmailSecurityController RBAC & Guard Declarations (T08 / S05)', () => {
  const reflector = new Reflector();

  it('protects controller with JwtAuthGuard and PermissionsGuard', () => {
    const guards = reflector.get<any[]>(
      GUARDS_METADATA,
      EmailSecurityController,
    );
    expect(guards).toContain(JwtAuthGuard);
    expect(guards).toContain(PermissionsGuard);
  });

  it('requires distinct email:* permissions on overview, connectors, actions, and policies', () => {
    const proto = EmailSecurityController.prototype;
    expect(reflector.get(PERMISSIONS_KEY, proto.getOverview)).toContain(
      PERMISSION_CODES.EMAIL_THREAT_READ,
    );
    expect(
      reflector.get(PERMISSIONS_KEY, proto.createConnectionIntent),
    ).toContain(PERMISSION_CODES.EMAIL_CONNECTOR_MANAGE);
    expect(reflector.get(PERMISSIONS_KEY, proto.approvePolicy)).toContain(
      PERMISSION_CODES.EMAIL_POLICY_MANAGE,
    );
    expect(reflector.get(PERMISSIONS_KEY, proto.buildEvidenceExport)).toContain(
      PERMISSION_CODES.EMAIL_EVIDENCE_EXPORT,
    );
    expect(reflector.get(PERMISSIONS_KEY, proto.approveAction)).toContain(
      PERMISSION_CODES.EMAIL_ACTION_APPROVE,
    );
    expect(reflector.get(PERMISSIONS_KEY, proto.executeAction)).toContain(
      PERMISSION_CODES.EMAIL_ACTION_EXECUTE,
    );
  });
});
