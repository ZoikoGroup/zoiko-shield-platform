import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-microsoft';
import { OAuthProfile } from '../interfaces/oauth-profile.interface';

interface MicrosoftProfile {
  id: string;
  displayName?: string;
  emails?: { value: string }[];
}

type VerifyDone = (err: Error | null, user?: OAuthProfile | false) => void;

@Injectable()
export class MicrosoftStrategy extends PassportStrategy(Strategy, 'microsoft') {
  private readonly tenantId: string;

  constructor(config: ConfigService) {
    const tenantId = config.get<string>('MICROSOFT_TENANT_ID') || 'common';
    super({
      clientID: config.get<string>('MICROSOFT_CLIENT_ID') || 'unconfigured',
      clientSecret:
        config.get<string>('MICROSOFT_CLIENT_SECRET') || 'unconfigured',
      callbackURL:
        config.get<string>('MICROSOFT_CALLBACK_URL') ||
        '/auth/microsoft/callback',
      tenant: tenantId,
      scope: ['user.read'],
    });
    this.tenantId = tenantId;
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: MicrosoftProfile,
    done: VerifyDone,
  ): void {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      done(new Error('Microsoft profile did not include an email address'));
      return;
    }
    done(null, {
      issuer: `https://login.microsoftonline.com/${this.tenantId}/v2.0`,
      providerUserId: profile.id,
      email,
      fullName: profile.displayName,
    });
  }
}
