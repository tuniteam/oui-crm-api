import { Module } from '@nestjs/common';
import { AuthModule } from '@/auth/auth.module';
import { FilesModule } from '@/files/files.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [AuthModule, FilesModule],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
