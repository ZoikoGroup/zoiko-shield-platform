import { Test, TestingModule } from '@nestjs/testing';
import * as crypto from 'crypto';
import { Fido2StepupGuardService } from '../../../../shield-action/src/auth/fido2-stepup-guard.service';
import { WorkloadTokenBrokerService } from '../workload-identity/workload-token-broker.service';

describe('Fido2StepupGuardService & WorkloadTokenBrokerService (LAB 21 Zero-Trust Auth)', () => {
  let fido2Guard: Fido2StepupGuardService;
  let workloadBroker: WorkloadTokenBrokerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: Fido2StepupGuardService,
          useValue: new Fido2StepupGuardService(),
        },
        WorkloadTokenBrokerService,
      ],
    }).compile();

    fido2Guard = module.get<Fido2StepupGuardService>(Fido2StepupGuardService);
    workloadBroker = module.get<WorkloadTokenBrokerService>(
      WorkloadTokenBrokerService,
    );
  });

  describe('FIDO2 WebAuthn Hardware Step-Up Attestation', () => {
    it('should generate challenge and verify valid hardware signature with user presence & verification', () => {
      // 1. Generate test WebAuthn keypair (ECDSA P-256)
      const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
        namedCurve: 'prime256v1',
      });
      const publicKeyPem = publicKey
        .export({ type: 'spki', format: 'pem' })
        .toString();

      const credentialId = 'cred-fido2-hardware-key-01';
      const analystId = 'analyst-alice-lead';

      fido2Guard.registerCredential({
        credentialId,
        analystId,
        publicKeyPem,
      });

      // 2. Issue step-up challenge
      const challenge = fido2Guard.issueChallenge({
        tenantId: 'tenant-enterprise-bank',
        analystId,
        proposalId: 'prop-isolate-host-99',
        actionType: 'ISOLATE_HOST',
        targetResource: 'arn:aws:ec2:us-east-1:123456789012:instance/i-998877',
      });

      expect(challenge.challengeId).toBeDefined();
      expect(challenge.challengeBase64).toBeDefined();

      // 3. Construct genuine WebAuthn clientDataJSON & authenticatorData (Flags: UP=1, UV=1)
      const clientDataObj = {
        type: 'webauthn.get',
        challenge: challenge.challengeBase64,
        origin: 'https://security.zoikoshield.corp',
      };
      const clientDataJsonBase64 = Buffer.from(
        JSON.stringify(clientDataObj),
      ).toString('base64');
      const clientDataHash = crypto
        .createHash('sha256')
        .update(Buffer.from(clientDataJsonBase64, 'base64'))
        .digest();

      const rpIdHash = crypto
        .createHash('sha256')
        .update('security.zoikoshield.corp')
        .digest();
      const flags = Buffer.from([0x05]); // UP (bit 0) | UV (bit 2) = 0x01 | 0x04 = 0x05
      const signCountBuf = Buffer.alloc(4);
      signCountBuf.writeUInt32BE(101, 0);

      const authDataBuf = Buffer.concat([rpIdHash, flags, signCountBuf]);
      const authenticatorDataBase64 = authDataBuf.toString('base64');

      // 4. Sign (authData || clientDataHash)
      const dataToSign = Buffer.concat([authDataBuf, clientDataHash]);
      const signer = crypto.createSign('SHA256');
      signer.update(dataToSign);
      signer.end();
      const signatureHex = signer.sign(privateKey).toString('hex');

      // 5. Verify and grant step-up authorization
      const grant = fido2Guard.verifyAssertionAndGrant({
        challengeId: challenge.challengeId,
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
      expect(grant.stepUpAttestationDigest).toHaveLength(64);
    });
  });

  describe('SPIFFE Zero-Trust Workload Token Broker', () => {
    it('should issue and verify short-lived workload tokens between microservices', () => {
      const issued = workloadBroker.issueToken(
        'shield-core',
        'shield-action',
        'tenant-bank-99',
        300,
      );

      expect(issued.token).toBeDefined();
      expect(issued.spiffeId).toBe(
        'spiffe://zoikoshield.internal/ns/production/sa/shield-core',
      );
      expect(issued.nonce).toBeDefined();

      const claims = workloadBroker.verifyToken(issued.token, 'shield-action');
      expect(claims.sourceService).toBe('shield-core');
      expect(claims.targetService).toBe('shield-action');
      expect(claims.tenantId).toBe('tenant-bank-99');
    });

    it('should REJECT workload token replay attacks when nonce is reused', () => {
      const issued = workloadBroker.issueToken(
        'shield-ingest',
        'shield-core',
        'tenant-bank-99',
        300,
      );

      // First verification succeeds
      workloadBroker.verifyToken(issued.token, 'shield-core');

      // Replay attempt must fail
      expect(() =>
        workloadBroker.verifyToken(issued.token, 'shield-core'),
      ).toThrow(/WORKLOAD_REPLAY_ATTACK_DETECTED/);
    });

    it('should REJECT token when presented to a different target satellite service', () => {
      const issued = workloadBroker.issueToken(
        'shield-core',
        'shield-ai',
        'tenant-bank-99',
        300,
      );

      // Presented to shield-action instead of shield-ai
      expect(() =>
        workloadBroker.verifyToken(issued.token, 'shield-action'),
      ).toThrow(/WORKLOAD_TARGET_MISMATCH/);
    });
  });
});
