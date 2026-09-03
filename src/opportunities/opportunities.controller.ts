import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
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
import { ApiAuthResponses, ApiCuidParam, ApiDeleteResponse, ApiGetResponse, ApiListResponse, ApiPatchResponse, ApiPostResponse } from '@/common/decorators';
import { ApiMessages } from '@/common/messages';
import { ParseCuidPipe } from '@/common/pipes';
import { OpportunitiesService } from './opportunities.service';
import {
  ChangeOpportunityStageDto,
  CreateOpportunityDto,
  LoseOpportunityDto,
  OpportunitiesListResponseDto,
  OpportunityBoardResponseDto,
  OpportunityDetailDto,
  OpportunityDto,
  OpportunityIdResponseDto,
  OpportunityListQueryDto,
  UpdateOpportunityDto,
} from './dto/opportunity.dto';

const swagger = ApiMessages.swagger;

/**
 * US-02-09 — the opportunity pipeline. A sales rep granted the OWN scope only sees the
 * opportunities they own; the geographic scope of the record applies on top, in SQL.
 */
@ApiTags(swagger.opportunities.tag)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@ApiAuthResponses()
@UseGuards(JwtAuthGuard, ProjectGuard, PermissionsGuard)
@ProjectScoped()
@ApiHeader({ name: PROJECT_ID_HEADER, description: swagger.projectIdHeaderDesc, required: true })
@Controller('opportunities')
export class OpportunitiesController {
  constructor(private readonly opportunitiesService: OpportunitiesService) {}

  @Get()
  @Permissions({ code: 'opportunities:read' })
  @ApiOperation(swagger.opportunities.list)
  @ApiListResponse(OpportunitiesListResponseDto)
  findAll(
    @CurrentProjectId() projectId: string,
    @Query() query: OpportunityListQueryDto,
    @ScopeFilter('opportunities:read') scopeWhere: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OpportunitiesListResponseDto> {
    return this.opportunitiesService.findAll(projectId, query, scopeWhere, user);
  }

  @Get('board')
  @Permissions({ code: 'opportunities:read' })
  @ApiOperation(swagger.opportunities.board)
  @ApiGetResponse(OpportunityBoardResponseDto)
  board(
    @CurrentProjectId() projectId: string,
    @ScopeFilter('opportunities:read') scopeWhere: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OpportunityBoardResponseDto> {
    return this.opportunitiesService.board(projectId, scopeWhere, user);
  }

  @Get(':id')
  @Permissions({ code: 'opportunities:read' })
  @ApiOperation(swagger.opportunities.get)
  @ApiCuidParam('id', swagger.params.opportunityId)
  @ApiGetResponse(OpportunityDetailDto)
  findOne(
    @Param('id', ParseCuidPipe) id: string,
    @CurrentProjectId() projectId: string,
    @ScopeFilter('opportunities:read') scopeWhere: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OpportunityDetailDto> {
    return this.opportunitiesService.findOne(id, projectId, scopeWhere, user);
  }

  @Post()
  @Permissions({ code: 'opportunities:create' })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation(swagger.opportunities.create)
  @ApiPostResponse(OpportunityIdResponseDto)
  create(
    @CurrentProjectId() projectId: string,
    @Body() dto: CreateOpportunityDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OpportunityIdResponseDto> {
    return this.opportunitiesService.create(projectId, dto, user);
  }

  @Patch(':id')
  @Permissions({ code: 'opportunities:update' })
  @ApiOperation(swagger.opportunities.update)
  @ApiCuidParam('id', swagger.params.opportunityId)
  @ApiPatchResponse(OpportunityDto)
  update(
    @Param('id', ParseCuidPipe) id: string,
    @CurrentProjectId() projectId: string,
    @Body() dto: UpdateOpportunityDto,
    @ScopeFilter('opportunities:update') scopeWhere: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OpportunityDto> {
    return this.opportunitiesService.update(id, projectId, dto, scopeWhere, user);
  }

  @Post(':id/stage')
  @Permissions({ code: 'opportunities:update' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation(swagger.opportunities.stage)
  @ApiCuidParam('id', swagger.params.opportunityId)
  @ApiPatchResponse(OpportunityDto)
  changeStage(
    @Param('id', ParseCuidPipe) id: string,
    @CurrentProjectId() projectId: string,
    @Body() dto: ChangeOpportunityStageDto,
    @ScopeFilter('opportunities:update') scopeWhere: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OpportunityDto> {
    return this.opportunitiesService.changeStage(id, projectId, dto, scopeWhere, user);
  }

  @Post(':id/lose')
  @Permissions({ code: 'opportunities:update' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation(swagger.opportunities.lose)
  @ApiCuidParam('id', swagger.params.opportunityId)
  @ApiPatchResponse(OpportunityDto)
  lose(
    @Param('id', ParseCuidPipe) id: string,
    @CurrentProjectId() projectId: string,
    @Body() dto: LoseOpportunityDto,
    @ScopeFilter('opportunities:update') scopeWhere: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OpportunityDto> {
    return this.opportunitiesService.lose(id, projectId, dto, scopeWhere, user);
  }

  @Delete(':id')
  @Permissions({ code: 'opportunities:delete' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation(swagger.opportunities.delete)
  @ApiCuidParam('id', swagger.params.opportunityId)
  @ApiDeleteResponse()
  remove(
    @Param('id', ParseCuidPipe) id: string,
    @CurrentProjectId() projectId: string,
    @ScopeFilter('opportunities:delete') scopeWhere: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.opportunitiesService.remove(id, projectId, scopeWhere, user);
  }
}
