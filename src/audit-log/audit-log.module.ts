import { Global, Module } from '@nestjs/common';
import { AuthModule } from '@/auth/auth.module';
import { AuditLogController } from './audit-log.controller';
import { AuditLogService } from './audit-log.service';

/** Global: every module writes audit entries; the read controller needs the auth guards (no cycle). */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [AuditLogController],
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditLogModule {}
