import { Module } from '@nestjs/common';
import { AuthModule } from '@/auth/auth.module';
import { StorageModule } from '@/storage/storage.module';
import { UsersBackofficeController } from './users-backoffice.controller';
import { UsersBackofficeService } from './users-backoffice.service';

@Module({
  imports: [AuthModule, StorageModule],
  controllers: [UsersBackofficeController],
  providers: [UsersBackofficeService],
})
export class UsersBackofficeModule {}
