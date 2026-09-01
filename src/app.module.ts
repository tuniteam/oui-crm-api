// ============================================
// OUI-CRM - App Module
// Root module
// ============================================

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { StorageModule } from './storage/storage.module';
import { FilesModule } from './files/files.module';
import { MailModule } from './mail/mail.module';
import { AuthModule } from './auth/auth.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { ProjectsModule } from './projects/projects.module';
import { ProfileModule } from './profile/profile.module';
import { LegalModule } from './legal/legal.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { ScopesModule } from './scopes/scopes.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    PrismaModule,
    AuthModule,
    AuditLogModule,
    ProjectsModule,
    ProfileModule,
    LegalModule,
    UsersModule,
    RolesModule,
    ScopesModule,
    HealthModule,
    StorageModule,
    FilesModule,
    MailModule,
  ],
})
export class AppModule {}
