import { Controller, Delete, HttpCode, HttpStatus, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PROJECT_ID_HEADER } from '@/auth/auth.constants';
import { CurrentProjectId } from '@/auth/decorators/current-project.decorator';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import { Permissions } from '@/auth/decorators/permissions.decorator';
import { ProjectScoped } from '@/auth/decorators/project-scoped.decorator';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guards';
import { PermissionsGuard } from '@/auth/guards/permissions.guard';
import { ProjectGuard } from '@/auth/guards/project.guard';
import { AuthenticatedUser } from '@/auth/interfaces/authenticated-user.interface';
import { SWAGGER_BEARER_AUTH } from '@/common/constants/app.constants';
import { ApiAuthResponses, ApiCuidParam, ApiDeleteResponse } from '@/common/decorators';
import { ApiMessages } from '@/common/messages';
import { ParseCuidPipe } from '@/common/pipes';
import { ImportService } from './import.service';

const swagger = ApiMessages.swagger;

/** US-01-06/14 — batch lifecycle shared by every import profile. */
@ApiTags(swagger.imports.tag)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@ApiAuthResponses()
@UseGuards(JwtAuthGuard, ProjectGuard, PermissionsGuard)
@ProjectScoped()
@ApiHeader({ name: PROJECT_ID_HEADER, description: swagger.projectIdHeaderDesc, required: true })
@Controller('import')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Delete('batches/:batchId')
  @Permissions({ code: 'organizations:import' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation(swagger.imports.cancelBatch)
  @ApiCuidParam('batchId', swagger.params.importBatchId)
  @ApiDeleteResponse()
  cancelBatch(
    @CurrentProjectId() projectId: string,
    @Param('batchId', ParseCuidPipe) batchId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.importService.cancelBatch(projectId, batchId, user);
  }
}
