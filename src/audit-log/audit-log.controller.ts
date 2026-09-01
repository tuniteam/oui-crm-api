import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PROJECT_ID_HEADER } from '@/auth/auth.constants';
import { CurrentProjectId } from '@/auth/decorators/current-project.decorator';
import { Permissions } from '@/auth/decorators/permissions.decorator';
import { ProjectScoped } from '@/auth/decorators/project-scoped.decorator';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guards';
import { PermissionsGuard } from '@/auth/guards/permissions.guard';
import { ProjectGuard } from '@/auth/guards/project.guard';
import { SWAGGER_BEARER_AUTH } from '@/common/constants/app.constants';
import { ApiListResponse, ApiAuthResponses } from '@/common/decorators';
import { ApiMessages } from '@/common/messages';
import { AuditLogService } from './audit-log.service';
import { AuditLogQueryDto } from './dto/query-audit-log.dto';
import { AuditLogListResponseDto } from './dto/response-audit-log.dto';

const swagger = ApiMessages.swagger;

/** US-00-10 — journal of the current project (read only; CSV export comes with US-05-03). */
@ApiTags(swagger.auditLog.tag)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@ApiAuthResponses()
@UseGuards(JwtAuthGuard, ProjectGuard, PermissionsGuard)
@ProjectScoped()
@ApiHeader({ name: PROJECT_ID_HEADER, description: swagger.projectIdHeaderDesc, required: true })
@Controller('audit-log')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @Permissions({ code: 'auditLog:read' })
  @ApiOperation(swagger.auditLog.list)
  @ApiListResponse(AuditLogListResponseDto)
  findAll(@CurrentProjectId() projectId: string, @Query() query: AuditLogQueryDto): Promise<AuditLogListResponseDto> {
    return this.auditLogService.findAll(projectId, query);
  }
}
