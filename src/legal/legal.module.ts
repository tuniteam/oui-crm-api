import { Module } from '@nestjs/common';
import { AuditLogModule } from '@/audit-log/audit-log.module';
import { LegalController } from './legal.controller';
import { LegalService } from './legal.service';

@Module({
  imports: [AuditLogModule],
  controllers: [LegalController],
  providers: [LegalService],
})
export class LegalModule {}
