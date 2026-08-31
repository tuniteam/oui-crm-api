import { Module, Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import * as ms from 'ms';
import { MS_PER_SECOND } from '@/common/utils/date.utils';
import { AuditLogModule } from '@/audit-log/audit-log.module';
import { MailModule } from '@/mail/mail.module';
import { ActivationService } from './activation.service';
import {
  AUTH_ENV,
  DEFAULT_ACCESS_EXPIRATION,
  DEFAULT_REFRESH_EXPIRATION,
  JWT_ACCESS_SERVICE,
  JWT_REFRESH_SERVICE,
  TOKEN_FLOWS,
} from './auth.constants';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailChangeService } from './email-change.service';
import { PermissionsGuard } from './guards/permissions.guard';
import { ProjectGuard } from './guards/project.guard';
import { PasswordResetService } from './password-reset.service';
import { JwtStrategy } from './strategies/jwt.strategy';

/**
 * One JwtService per token kind, each with its own secret and lifetime (.env):
 * a leaked activation secret cannot forge an access token.
 */
function jwtProvider(spec: {
  diToken: string;
  jwtSecretKey: string;
  expirationKey: string;
  defaultExpiration: string;
}): Provider {
  return {
    provide: spec.diToken,
    inject: [ConfigService],
    useFactory: (config: ConfigService) => {
      const expiration = config.get<string>(spec.expirationKey) || spec.defaultExpiration;
      return new JwtService({
        secret: config.get<string>(spec.jwtSecretKey),
        signOptions: { expiresIn: ms(expiration as ms.StringValue) / MS_PER_SECOND, algorithm: 'HS256' },
      });
    },
  };
}

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' }), ConfigModule, MailModule, AuditLogModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    ActivationService,
    PasswordResetService,
    EmailChangeService,
    JwtStrategy,
    ProjectGuard,
    PermissionsGuard,
    jwtProvider({
      diToken: JWT_ACCESS_SERVICE,
      jwtSecretKey: AUTH_ENV.JWT_ACCESS_SECRET,
      expirationKey: AUTH_ENV.JWT_ACCESS_EXPIRATION,
      defaultExpiration: DEFAULT_ACCESS_EXPIRATION,
    }),
    jwtProvider({
      diToken: JWT_REFRESH_SERVICE,
      jwtSecretKey: AUTH_ENV.JWT_REFRESH_SECRET,
      expirationKey: AUTH_ENV.JWT_REFRESH_EXPIRATION,
      defaultExpiration: DEFAULT_REFRESH_EXPIRATION,
    }),
    ...Object.values(TOKEN_FLOWS).map(jwtProvider),
  ],
  exports: [AuthService, ActivationService, ProjectGuard, PermissionsGuard],
})
export class AuthModule {}
