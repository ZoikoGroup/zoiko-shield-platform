-- WebAuthn/FIDO2 passkeys. Sessions authenticated this way carry PASSKEY
-- assurance, which is what @RequireAssurance-gated endpoints demand; before
-- this, password logins could only ever reach PASSWORD assurance.
CREATE TABLE IF NOT EXISTS identity.webauthn_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "principalId" uuid NOT NULL,
  "credentialId" text NOT NULL UNIQUE,
  "publicKeyPem" text NOT NULL,
  "signCount" bigint NOT NULL DEFAULT 0,
  label varchar,
  transports varchar,
  "lastUsedAt" timestamptz,
  "revokedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webauthn_credentials_principal
  ON identity.webauthn_credentials ("principalId");

-- Challenges are persisted, not in-process, so a replay cannot be retried
-- against another instance and consumption stays atomic across the fleet.
CREATE TABLE IF NOT EXISTS identity.webauthn_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "principalId" uuid,
  purpose varchar NOT NULL,
  challenge text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "consumedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webauthn_challenges_lookup
  ON identity.webauthn_challenges (challenge);

CREATE INDEX IF NOT EXISTS webauthn_challenges_principal
  ON identity.webauthn_challenges ("principalId");
