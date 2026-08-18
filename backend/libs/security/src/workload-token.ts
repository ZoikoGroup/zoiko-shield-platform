import { randomUUID } from 'crypto';
import { sign, verify, type Algorithm, type JwtPayload } from 'jsonwebtoken';

const TOKEN_TTL_SECONDS = 60;

function signingMaterial(): { key: string; algorithm: Algorithm } {
  if (process.env.WORKLOAD_IDENTITY_PRIVATE_KEY_PEM) {
    return {
      key: process.env.WORKLOAD_IDENTITY_PRIVATE_KEY_PEM.replace(/\\n/g, '\n'),
      algorithm: 'RS256',
    };
  }
  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.WORKLOAD_IDENTITY_DEV_SECRET
  ) {
    return {
      key: process.env.WORKLOAD_IDENTITY_DEV_SECRET,
      algorithm: 'HS256',
    };
  }
  throw new Error('A workload identity private key is required');
}

function verificationMaterial(): { key: string; algorithms: Algorithm[] } {
  if (process.env.WORKLOAD_IDENTITY_PUBLIC_KEY_PEM) {
    return {
      key: process.env.WORKLOAD_IDENTITY_PUBLIC_KEY_PEM.replace(/\\n/g, '\n'),
      algorithms: ['RS256'],
    };
  }
  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.WORKLOAD_IDENTITY_DEV_SECRET
  ) {
    return {
      key: process.env.WORKLOAD_IDENTITY_DEV_SECRET,
      algorithms: ['HS256'],
    };
  }
  throw new Error('A workload identity public key is required');
}

export function createWorkloadToken(audience: string): string {
  const subject = process.env.SERVICE_NAME;
  if (!subject)
    throw new Error('SERVICE_NAME is required to issue a workload token');
  const { key, algorithm } = signingMaterial();
  return sign({}, key, {
    algorithm,
    audience,
    issuer: 'zoikoshield-workload-identity',
    subject,
    expiresIn: TOKEN_TTL_SECONDS,
    jwtid: randomUUID(),
  });
}

export function verifyWorkloadToken(
  token: string,
  audience: string,
): JwtPayload {
  const { key, algorithms } = verificationMaterial();
  const result = verify(token, key, {
    algorithms,
    audience,
    issuer: 'zoikoshield-workload-identity',
    clockTolerance: 5,
  });
  if (
    typeof result === 'string' ||
    !result.sub ||
    !result.jti ||
    !result.exp ||
    !result.iat
  ) {
    throw new Error('Workload token is missing required claims');
  }
  if (result.exp - result.iat > TOKEN_TTL_SECONDS) {
    throw new Error('Workload token lifetime exceeds the maximum');
  }
  return result;
}

export function workloadAuthorizationHeaders(
  audience: string,
): Record<string, string> {
  return { authorization: `Bearer ${createWorkloadToken(audience)}` };
}
