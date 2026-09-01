import { Module } from '@nestjs/common';
import { AuditLogModule } from '@/audit-log/audit-log.module';
import { AuthModule } from '@/auth/auth.module';
import { FilesModule } from '@/files/files.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [AuthModule, AuditLogModule, FilesModule],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
