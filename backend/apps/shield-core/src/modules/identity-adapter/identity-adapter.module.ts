import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { Session } from './session.entity';
import { OtpCode } from './otp-code.entity';
import { UserService } from './user.service';
import { SessionService } from './session.service';
import { OtpService } from './otp.service';
import { MailService } from './mail.service';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { MicrosoftStrategy } from './strategies/microsoft.strategy';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Session, OtpCode]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get<string>('JWT_EXPIRES_IN', '15m') as `${number}${'s' | 'm' | 'h' | 'd'}`,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    UserService,
    SessionService,
    OtpService,
    MailService,
    AuthService,
    JwtStrategy,
    GoogleStrategy,
    MicrosoftStrategy,
  ],
  exports: [UserService],
})
export class IdentityAdapterModule {}
