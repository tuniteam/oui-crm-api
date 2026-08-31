import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AuditLogService } from '@/audit-log/audit-log.service';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import { Permissions } from '@/auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guards';
import { PermissionsGuard } from '@/auth/guards/permissions.guard';
import { AuthenticatedUser } from '@/auth/interfaces/authenticated-user.interface';
import { ApiCuidParam, ApiGetById, ApiListResponse, ApiPatchResponse, ApiPostResponse } from '@/common/decorators';
import { sendFileAttachment } from '@/common/helper/file-response.helper';
import { SWAGGER_BEARER_AUTH } from '@/common/constants/app.constants';
import { ApiMessages } from '@/common/messages';
import { ParseCuidPipe } from '@/common/pipes';
import { ChangeProjectStatusDto } from './dto/change-project-status.dto';
import { CreateProjectDto, CreateProjectResponseDto } from './dto/create-project.dto';
import { ProjectListQueryDto } from './dto/query-project-list.dto';
import {
  ProjectFeaturesResponseDto,
  ProjectListResponseDto,
  ProjectResponseDto,
} from './dto/response-project.dto';
import { UpdateProjectFeaturesDto } from './dto/update-project-features.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectConfigExportService } from './project-config-export.service';
import { AUDIT_OBJECTS } from '@/audit-log/audit-log.constants';
import { PROJECT_AUDIT, XLSX_MIME_TYPE } from './projects.constants';
import { ProjectsService } from './projects.service';

const swagger = ApiMessages.swagger;

/**
 * US-00-04 — backoffice administration of projects. Platform-level routes: no x-project-id,
 * permissions `projects:*` (SUPER_ADMIN, scope ALL).
 */
@ApiTags(swagger.projects.tag)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly configExportService: ProjectConfigExportService,
    private readonly audit: AuditLogService,
  ) {}

  @Get()
  @Permissions({ code: 'projects:read' })
  @ApiOperation(swagger.projects.list)
  @ApiListResponse(ProjectListResponseDto)
  findAll(@Query() query: ProjectListQueryDto): Promise<ProjectListResponseDto> {
    return this.projectsService.findAll(query);
  }

  @Post()
  @Permissions({ code: 'projects:create' })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation(swagger.projects.create)
  @ApiPostResponse(CreateProjectResponseDto)
  create(@Body() dto: CreateProjectDto, @CurrentUser() user: AuthenticatedUser): Promise<CreateProjectResponseDto> {
    return this.projectsService.create(dto, user.id);
  }

  @Get(':id')
  @Permissions({ code: 'projects:read' })
  @ApiOperation(swagger.projects.findOne)
  @ApiGetById('id', swagger.params.projectId, ProjectResponseDto)
  findOne(@Param('id', ParseCuidPipe) id: string): Promise<ProjectResponseDto> {
    return this.projectsService.findOne(id);
  }

  @Patch(':id')
  @Permissions({ code: 'projects:update' })
  @ApiOperation(swagger.projects.update)
  @ApiCuidParam('id', swagger.params.projectId)
  @ApiPatchResponse(CreateProjectResponseDto)
  update(
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CreateProjectResponseDto> {
    return this.projectsService.update(id, dto, user.id);
  }

  @Patch(':id/features')
  @Permissions({ code: 'projects:update' })
  @ApiOperation(swagger.projects.features)
  @ApiCuidParam('id', swagger.params.projectId)
  @ApiPatchResponse(ProjectFeaturesResponseDto)
  updateFeatures(
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: UpdateProjectFeaturesDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProjectFeaturesResponseDto> {
    return this.projectsService.updateFeatures(id, dto.features, user.id);
  }

  @Post(':id/status')
  @Permissions({ code: 'projects:update' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation(swagger.projects.changeStatus)
  @ApiCuidParam('id', swagger.params.projectId)
  @ApiBody({ type: ChangeProjectStatusDto })
  changeStatus(
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: ChangeProjectStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.projectsService.changeStatus(id, dto, user.id);
  }

  @Get(':id/config-export')
  @Permissions({ code: 'projects:read' })
  @ApiOperation(swagger.projects.configExport)
  @ApiCuidParam('id', swagger.params.projectId)
  @ApiProduces(XLSX_MIME_TYPE)
  @ApiOkResponse({ description: swagger.responses.attachment })
  async configExport(
    @Param('id', ParseCuidPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ): Promise<void> {
    await this.projectsService.findOne(id); // 404 before generating anything
    const file = await this.configExportService.export(id);
    await this.audit.logNow({
      projectId: id,
      userId: user.id,
      action: PROJECT_AUDIT.CONFIG_EXPORT,
      objectType: AUDIT_OBJECTS.PROJECT,
      objectId: id,
      metadata: { filename: file.filename },
    });
    sendFileAttachment(res, file);
  }
}
