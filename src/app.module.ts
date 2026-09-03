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
import { UsersBackofficeModule } from './users-backoffice/users-backoffice.module';
import { RolesModule } from './roles/roles.module';
import { ScopesModule } from './scopes/scopes.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { ContactsModule } from './contacts/contacts.module';
import { ActivitiesModule } from './activities/activities.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { ImportModule } from './import/import.module';
import { ExportsModule } from './exports/exports.module';
import { SearchModule } from './search/search.module';
import { SettingsModule } from './settings/settings.module';
import { ReferenceItemsModule } from './reference-items/reference-items.module';
import { PricingModule } from './pricing/pricing.module';
import { OpportunitiesModule } from './opportunities/opportunities.module';

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
    UsersBackofficeModule,
    RolesModule,
    ScopesModule,
    PricingModule,
    OpportunitiesModule,
    OrganizationsModule,
    ContactsModule,
    ActivitiesModule,
    CampaignsModule,
    ImportModule,
    ExportsModule,
    SearchModule,
    SettingsModule,
    ReferenceItemsModule,
    HealthModule,
    StorageModule,
    FilesModule,
    MailModule,
  ],
})
export class AppModule {}
