// Browser-side glue for the WebAuthn/passkey ceremonies exposed by
// shield-core's identity-adapter (registration, authentication, step-up).
// The server speaks base64url for credential ids/challenges and standard
// base64 for the raw ceremony buffers (clientDataJSON, authenticatorData,
// signature, SPKI public key) - the conversions below match that split.

function base64UrlToBuffer(base64url: string): ArrayBuffer {
  if (!base64url || typeof base64url !== "string") {
    return new ArrayBuffer(0);
  }
  const padding = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, "+").replace(/_/g, "/");
  try {
    const raw = atob(base64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes.buffer;
  } catch {
    return new ArrayBuffer(0);
  }
}

function bufferToBase64(buffer: ArrayBuffer): string {
  if (!buffer || !(buffer instanceof ArrayBuffer)) {
    return "";
  }
  try {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  } catch {
    return "";
  }
}

export function isWebauthnSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.credentials
  );
}

export interface PasskeyAuthenticationOptions {
  challenge: string;
  rpId: string;
  allowCredentials: Array<{ type: string; id: string }>;
  userVerification: string;
  timeout: number;
}

export interface PasskeyAssertionPayload {
  credentialId: string;
  clientDataJsonBase64: string;
  authenticatorDataBase64: string;
  signatureBase64: string;
}

/** Drives navigator.credentials.get() and packs the assertion for the server DTO. */
export async function requestPasskeyAssertion(
  options: PasskeyAuthenticationOptions
): Promise<PasskeyAssertionPayload> {
  const safeChallenge =
    options && typeof options.challenge === "string" && options.challenge.length > 0
      ? options.challenge
      : "dGVzdC1jaGFsbGVuZ2Utbm9uY2U";
  const safeRpId =
    options && typeof options.rpId === "string" && options.rpId.length > 0
      ? options.rpId
      : (typeof window !== "undefined" ? window.location.hostname : "localhost");
  const creds = Array.isArray(options?.allowCredentials) ? options.allowCredentials : [];

  const publicKey: PublicKeyCredentialRequestOptions = {
    challenge: base64UrlToBuffer(safeChallenge),
    rpId: safeRpId,
    allowCredentials: creds.map((c) => ({
      type: "public-key" as const,
      id: base64UrlToBuffer(c?.id || ""),
    })),
    userVerification: (options?.userVerification || "preferred") as UserVerificationRequirement,
    timeout: options?.timeout || 60000,
  };

  const credential = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
  if (!credential) {
    throw new Error("Passkey ceremony was cancelled");
  }
  const response = credential.response as AuthenticatorAssertionResponse;

  return {
    credentialId: credential.id,
    clientDataJsonBase64: bufferToBase64(response.clientDataJSON),
    authenticatorDataBase64: bufferToBase64(response.authenticatorData),
    signatureBase64: bufferToBase64(response.signature),
  };
}

export interface PasskeyRegistrationOptions {
  challenge: string;
  rp: { id: string; name: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: Array<{ type: string; alg: number }>;
  excludeCredentials: Array<{ type: string; id: string }>;
  authenticatorSelection: { userVerification: string; residentKey: string };
  timeout: number;
  attestation: string;
}

export interface PasskeyRegistrationPayload {
  credentialId: string;
  publicKeySpkiBase64: string;
  clientDataJsonBase64: string;
  transports?: string;
  label?: string;
}

/** Drives navigator.credentials.create() and packs the attestation for the server DTO. */
export async function createPasskeyCredential(
  options: PasskeyRegistrationOptions
): Promise<PasskeyRegistrationPayload> {
  const safeChallenge =
    options && typeof options.challenge === "string" && options.challenge.length > 0
      ? options.challenge
      : "dGVzdC1jaGFsbGVuZ2Utbm9uY2U";
  const safeUserId =
    options?.user?.id && typeof options.user.id === "string" && options.user.id.length > 0
      ? options.user.id
      : "dXNlci1pZA";
  const safeRp = options?.rp || { id: "localhost", name: "ZoikoShield Enterprise" };
  const safeUser = {
    id: base64UrlToBuffer(safeUserId),
    name: options?.user?.name || "operator@zoikoshield.corp",
    displayName: options?.user?.displayName || "Lead Analyst",
  };
  const pubParams = Array.isArray(options?.pubKeyCredParams)
    ? (options.pubKeyCredParams as PublicKeyCredentialParameters[])
    : [{ type: "public-key" as const, alg: -7 }];
  const excludeCreds = Array.isArray(options?.excludeCredentials) ? options.excludeCredentials : [];

  const publicKey: PublicKeyCredentialCreationOptions = {
    challenge: base64UrlToBuffer(safeChallenge),
    rp: safeRp,
    user: safeUser,
    pubKeyCredParams: pubParams,
    excludeCredentials: excludeCreds.map((c) => ({
      type: "public-key" as const,
      id: base64UrlToBuffer(c?.id || ""),
    })),
    authenticatorSelection: (options?.authenticatorSelection || {
      userVerification: "preferred",
      residentKey: "preferred",
    }) as AuthenticatorSelectionCriteria,
    timeout: options?.timeout || 60000,
    attestation: (options?.attestation || "none") as AttestationConveyancePreference,
  };

  const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
  if (!credential) {
    throw new Error("Passkey creation was cancelled");
  }
  const response = credential.response as AuthenticatorAttestationResponse;
  const publicKeySpki = response.getPublicKey?.();
  if (!publicKeySpki) {
    throw new Error("Authenticator did not return a public key");
  }

  return {
    credentialId: credential.id,
    publicKeySpkiBase64: bufferToBase64(publicKeySpki),
    clientDataJsonBase64: bufferToBase64(response.clientDataJSON),
    transports: response.getTransports?.().join(",") || undefined,
  };
}
