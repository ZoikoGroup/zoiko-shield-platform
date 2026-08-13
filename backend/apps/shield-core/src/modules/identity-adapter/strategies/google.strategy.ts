import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';
import { OAuthProfile } from '../interfaces/oauth-profile.interface';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    super({
      clientID: config.get<string>('GOOGLE_CLIENT_ID') || 'unconfigured',
      clientSecret:
        config.get<string>('GOOGLE_CLIENT_SECRET') || 'unconfigured',
      callbackURL:
        config.get<string>('GOOGLE_CALLBACK_URL') || '/auth/google/callback',
      scope: ['email', 'profile'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      done(
        new Error('Google profile did not include an email address'),
        undefined,
      );
      return;
    }
    const oauthProfile: OAuthProfile = {
      issuer: 'https://accounts.google.com',
      providerUserId: profile.id,
      email,
      fullName: profile.displayName,
      avatarUrl: profile.photos?.[0]?.value,
    };
    done(null, oauthProfile);
  }
}
