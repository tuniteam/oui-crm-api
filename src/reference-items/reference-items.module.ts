import { Module } from '@nestjs/common';
import { AuditLogModule } from '@/audit-log/audit-log.module';
import { AuthModule } from '@/auth/auth.module';
import { ReferenceItemsController } from './reference-items.controller';
import { ReferenceItemsService } from './reference-items.service';

@Module({
  imports: [AuthModule, AuditLogModule],
  controllers: [ReferenceItemsController],
  providers: [ReferenceItemsService],
})
export class ReferenceItemsModule {}
