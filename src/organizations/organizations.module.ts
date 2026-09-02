import { Module } from '@nestjs/common';
import { AuditLogModule } from '@/audit-log/audit-log.module';
import { ScopesModule } from '@/scopes/scopes.module';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  imports: [AuditLogModule, ScopesModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
