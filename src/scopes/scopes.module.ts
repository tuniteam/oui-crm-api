import { Module } from '@nestjs/common';
import { AuditLogModule } from '@/audit-log/audit-log.module';
import { AuthModule } from '@/auth/auth.module';
import { ScopeService } from './scope.service';
import { ScopesController } from './scopes.controller';
import { ScopesService } from './scopes.service';

@Module({
  imports: [AuthModule, AuditLogModule],
  controllers: [ScopesController],
  providers: [ScopesService, ScopeService],
  exports: [ScopeService],
})
export class ScopesModule {}
