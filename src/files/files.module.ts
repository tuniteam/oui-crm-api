import { Module } from '@nestjs/common';
import { StorageModule } from '@/storage/storage.module';
import { FileService } from './file.service';
import { FilesController } from './files.controller';

@Module({
  imports: [StorageModule],
  controllers: [FilesController],
  providers: [FileService],
  exports: [FileService],
})
export class FilesModule {}
