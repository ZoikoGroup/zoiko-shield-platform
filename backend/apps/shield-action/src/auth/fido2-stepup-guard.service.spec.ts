import { Fido2StepupGuardService } from './fido2-stepup-guard.service';
import * as crypto from 'crypto';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

describe('Fido2StepupGuardService', () => {
  let fido2Guard: Fido2StepupGuardService;

  beforeEach(() => {
    fido2Guard = new Fido2StepupGuardService();
  });

  it('should issue an ephemeral challenge and successfully verify valid hardware key assertion', () => {
    // Generate test WebAuthn keypair (ECDSA P-256)
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    });
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const credentialId = 'yubikey-5-nfc-credential-id-12345';
    fido2Guard.registerCredential({
      credentialId,
      analystId: 'soc-lead@enterprise.com',
      publicKeyPem,
    });

    // 1. Issue Challenge
    const session = fido2Guard.issueChallenge({
      tenantId: 'tenant-enterprise-01',
      analystId: 'soc-lead@enterprise.com',
      proposalId: 'prop-isolate-vpc-991',
      actionType: 'ISOLATE_ENTIRE_VPC',
      targetResource: 'vpc-prod-us-east-1',
    });

    expect(session.challengeId).toBeDefined();
    expect(session.challengeBase64).toBeDefined();

    // 2. Build ClientDataJSON
    const clientDataObj = {
      type: 'webauthn.get',
      challenge: session.challengeBase64,
      origin: 'https://security.zoikoshield.corp',
    };
    const clientDataJsonBase64 = Buffer.from(JSON.stringify(clientDataObj)).toString('base64');
    const clientDataHash = crypto.createHash('sha256').update(Buffer.from(clientDataJsonBase64, 'base64')).digest();

    // 3. Build AuthenticatorData (with User Presence and User Verification flags set)
    const authDataBuf = Buffer.concat([
      crypto.createHash('sha256').update('security.zoikoshield.corp').digest(),
      Buffer.from([0x05]), // Flags: UP (0x01) + UV (0x04)
      Buffer.from([0, 0, 0, 1]), // Sign count
    ]);
    const authenticatorDataBase64 = authDataBuf.toString('base64');

    // 4. Sign (authData || clientDataHash)
    const signer = crypto.createSign('SHA256');
    signer.update(Buffer.concat([authDataBuf, clientDataHash]));
    signer.end();
    const signatureHex = signer.sign(privateKey).toString('hex');

    // 5. Verify & Grant Step-Up Authorization
    const grant = fido2Guard.verifyAssertionAndGrant({
      challengeId: session.challengeId,
      credentialId,
      authenticatorDataBase64,
      clientDataJsonBase64,
      signatureHex,
      publicKeyPem,
    });

    expect(grant.grantId).toBeDefined();
    expect(grant.fido2Verified).toBe(true);
    expect(grant.userPresenceVerified).toBe(true);
    expect(grant.userVerificationVerified).toBe(true);
    expect(grant.proposalId).toBe('prop-isolate-vpc-991');
    expect(grant.stepUpAttestationDigest).toBeDefined();
  });

  it('should reject replay or unissued challenges', () => {
    expect(() => {
      fido2Guard.verifyAssertionAndGrant({
        challengeId: 'non-existent-challenge-id',
        credentialId: 'cred-123',
        authenticatorDataBase64: Buffer.from('test').toString('base64'),
        clientDataJsonBase64: Buffer.from(JSON.stringify({ challenge: 'xyz' })).toString('base64'),
        signatureHex: 'deadbeef',
        publicKeyPem: 'test',
      });
    }).toThrow(UnauthorizedException);
  });
});
