import { Module } from '@nestjs/common';
import { AuditLogModule } from '@/audit-log/audit-log.module';
import { ScopesModule } from '@/scopes/scopes.module';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';

@Module({
  imports: [AuditLogModule, ScopesModule],
  controllers: [ExportsController],
  providers: [ExportsService],
})
export class ExportsModule {}
