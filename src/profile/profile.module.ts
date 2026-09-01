import { Module } from '@nestjs/common';
import { FilesModule } from '@/files/files.module';
import { StorageModule } from '@/storage/storage.module';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

@Module({
  imports: [FilesModule, StorageModule],
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}
