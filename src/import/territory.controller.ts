import { Body, Controller, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
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
import { ApiAuthResponses, ApiPatchResponse } from '@/common/decorators';
import { ApiMessages } from '@/common/messages';
import { ImportRunQueryDto, TerritoryImportDto, TerritoryReportDto } from './dto/territory.dto';
import { TerritoryService } from './territory.service';

const swagger = ApiMessages.swagger;

/** US-01-14 — a whole territory in one call, from the open geo reference, no file to prepare. */
@ApiTags(swagger.imports.tag)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@ApiAuthResponses()
@UseGuards(JwtAuthGuard, ProjectGuard, PermissionsGuard)
@ProjectScoped()
@ApiHeader({ name: PROJECT_ID_HEADER, description: swagger.projectIdHeaderDesc, required: true })
@Controller('organizations')
export class TerritoryController {
  constructor(private readonly territoryService: TerritoryService) {}

  @Post('import-territory')
  @Permissions({ code: 'organizations:import' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation(swagger.imports.territory)
  @ApiPatchResponse(TerritoryReportDto)
  importTerritory(
    @CurrentProjectId() projectId: string,
    @Query() query: ImportRunQueryDto,
    @Body() dto: TerritoryImportDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TerritoryReportDto> {
    return this.territoryService.import(projectId, dto, query.dryRun === 'true', user);
  }
}
