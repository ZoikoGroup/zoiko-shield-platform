import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class WebauthnAuthenticationOptionsDto {
  @IsEmail()
  email!: string;
}

export class VerifyWebauthnRegistrationDto {
  /** base64url credential id (PublicKeyCredential.id). */
  @IsString()
  @MaxLength(1000)
  credentialId!: string;

  /**
   * base64 SPKI DER from AuthenticatorAttestationResponse.getPublicKey().
   * Using the browser-parsed key keeps attestation-object CBOR decoding out
   * of the server; attestation itself is therefore not verified (equivalent
   * to attestation: 'none'), which is the intended posture here.
   */
  @IsString()
  @MaxLength(4000)
  publicKeySpkiBase64!: string;

  @IsString()
  @MaxLength(8000)
  clientDataJsonBase64!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  transports?: string;
}

/** The four fields every WebAuthn assertion carries, whatever it is used for. */
export class WebauthnAssertionDto {
  @IsString()
  @MaxLength(1000)
  credentialId!: string;

  @IsString()
  @MaxLength(8000)
  clientDataJsonBase64!: string;

  @IsString()
  @MaxLength(8000)
  authenticatorDataBase64!: string;

  @IsString()
  @MaxLength(8000)
  signatureBase64!: string;
}

/** Login has no session to inherit a tenant from, so it must name one. */
export class PasskeyLoginDto extends WebauthnAssertionDto {
  @IsUUID()
  tenantId!: string;

  @IsOptional()
  @IsUUID()
  environmentId?: string;
}

/** Step-up reuses the caller's existing session tenant. */
export class PasskeyStepUpDto extends WebauthnAssertionDto {
  @IsOptional()
  @IsUUID()
  environmentId?: string;
}
