import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { PROJECT_ID_HEADER } from '@/auth/auth.constants';
import { CurrentProjectId } from '@/auth/decorators/current-project.decorator';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import { Permissions } from '@/auth/decorators/permissions.decorator';
import { ProjectScoped } from '@/auth/decorators/project-scoped.decorator';
import { ScopeFilter } from '@/auth/decorators/scope-filter.decorator';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guards';
import { PermissionsGuard } from '@/auth/guards/permissions.guard';
import { ProjectGuard } from '@/auth/guards/project.guard';
import { AuthenticatedUser } from '@/auth/interfaces/authenticated-user.interface';
import { SWAGGER_BEARER_AUTH } from '@/common/constants/app.constants';
import { ApiAuthResponses, ApiCuidParam, ApiDeleteResponse, ApiListResponse, ApiPatchResponse, ApiPostResponse } from '@/common/decorators';
import { sendFileAttachment } from '@/common/helper/file-response.helper';
import { ApiMessages } from '@/common/messages';
import { ParseCuidPipe } from '@/common/pipes';
import { ActivitiesService } from './activities.service';
import { CompleteActivityDto } from './dto/complete-activity.dto';
import { CreateActivityDto } from './dto/create-activity.dto';
import { ActivityListQueryDto } from './dto/query-activity-list.dto';
import { AgendaQueryDto } from './dto/agenda-query.dto';
import { ActivitiesListResponseDto, ActivityDto, AgendaResponseDto } from './dto/response-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';

const swagger = ApiMessages.swagger;

/**
 * US-01-08/09 — activities and agenda. The OWN scope of a sales rep travels as the
 * scopeFilter fragment: their own activities only, applied in SQL.
 */
@ApiTags(swagger.activities.tag)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@ApiAuthResponses()
@UseGuards(JwtAuthGuard, ProjectGuard, PermissionsGuard)
@ProjectScoped()
@ApiHeader({ name: PROJECT_ID_HEADER, description: swagger.projectIdHeaderDesc, required: true })
@Controller()
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Get('activities')
  @Permissions({ code: 'activities:read', ownerField: 'userId' })
  @ApiOperation(swagger.activities.list)
  @ApiListResponse(ActivitiesListResponseDto)
  findAll(
    @CurrentProjectId() projectId: string,
    @Query() query: ActivityListQueryDto,
    @ScopeFilter('activities:read') scopeWhere: Record<string, unknown>,
  ): Promise<ActivitiesListResponseDto> {
    return this.activitiesService.findAll(projectId, query, scopeWhere);
  }

  @Post('activities')
  @Permissions({ code: 'activities:create', ownerField: 'userId' })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation(swagger.activities.create)
  @ApiPostResponse(ActivityDto)
  create(
    @CurrentProjectId() projectId: string,
    @Body() dto: CreateActivityDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ActivityDto> {
    return this.activitiesService.create(projectId, dto, user);
  }

  @Patch('activities/:id')
  @Permissions({ code: 'activities:update', ownerField: 'userId' })
  @ApiOperation(swagger.activities.update)
  @ApiCuidParam('id', swagger.params.activityId)
  @ApiPatchResponse(ActivityDto)
  update(
    @CurrentProjectId() projectId: string,
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: UpdateActivityDto,
    @ScopeFilter('activities:update') scopeWhere: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ActivityDto> {
    return this.activitiesService.update(id, projectId, dto, scopeWhere, user);
  }

  @Post('activities/:id/complete')
  @Permissions({ code: 'activities:update', ownerField: 'userId' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation(swagger.activities.complete)
  @ApiCuidParam('id', swagger.params.activityId)
  @ApiPatchResponse(ActivityDto)
  complete(
    @CurrentProjectId() projectId: string,
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: CompleteActivityDto,
    @ScopeFilter('activities:update') scopeWhere: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ActivityDto> {
    return this.activitiesService.complete(id, projectId, dto, scopeWhere, user);
  }

  @Post('activities/:id/cancel')
  @Permissions({ code: 'activities:update', ownerField: 'userId' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation(swagger.activities.cancel)
  @ApiCuidParam('id', swagger.params.activityId)
  @ApiPatchResponse(ActivityDto)
  cancel(
    @CurrentProjectId() projectId: string,
    @Param('id', ParseCuidPipe) id: string,
    @ScopeFilter('activities:update') scopeWhere: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ActivityDto> {
    return this.activitiesService.cancel(id, projectId, scopeWhere, user);
  }

  @Delete('activities/:id')
  @Permissions({ code: 'activities:delete', ownerField: 'userId' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation(swagger.activities.delete)
  @ApiCuidParam('id', swagger.params.activityId)
  @ApiDeleteResponse()
  remove(
    @CurrentProjectId() projectId: string,
    @Param('id', ParseCuidPipe) id: string,
    @ScopeFilter('activities:delete') scopeWhere: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.activitiesService.remove(id, projectId, scopeWhere, user);
  }

  @Get('agenda')
  @Permissions({ code: 'activities:read', ownerField: 'userId' })
  @ApiOperation(swagger.activities.agenda)
  @ApiListResponse(AgendaResponseDto)
  agenda(
    @CurrentProjectId() projectId: string,
    @Query() query: AgendaQueryDto,
    @ScopeFilter('activities:read') scopeWhere: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AgendaResponseDto> {
    return this.activitiesService.agenda(projectId, query, scopeWhere, user);
  }

  @Get('activities/:id/ics')
  @Permissions({ code: 'activities:read', ownerField: 'userId' })
  @ApiOperation(swagger.activities.ics)
  @ApiCuidParam('id', swagger.params.activityId)
  @ApiProduces('text/calendar')
  async ics(
    @CurrentProjectId() projectId: string,
    @Param('id', ParseCuidPipe) id: string,
    @ScopeFilter('activities:read') scopeWhere: Record<string, unknown>,
    @Res() res: Response,
  ): Promise<void> {
    sendFileAttachment(res, await this.activitiesService.ics(id, projectId, scopeWhere));
  }
}
