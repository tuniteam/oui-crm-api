import { Module } from '@nestjs/common';
import { AuthModule } from '@/auth/auth.module';
import { StorageModule } from '@/storage/storage.module';
import { ProjectBootstrapService } from './project-bootstrap.service';
import { ProjectConfigExportService } from './project-config-export.service';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [AuthModule, StorageModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectBootstrapService, ProjectConfigExportService],
  exports: [ProjectsService, ProjectBootstrapService],
})
export class ProjectsModule {}
