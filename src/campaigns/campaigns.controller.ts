import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
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
import { ApiAuthResponses, ApiCuidParam, ApiDeleteResponse, ApiListResponse, ApiPatchResponse, ApiPostResponse } from '@/common/decorators';
import { ApiMessages } from '@/common/messages';
import { ParseCuidPipe } from '@/common/pipes';
import { CampaignsService } from './campaigns.service';
import {
  CampaignDto,
  CampaignIdResponseDto,
  CampaignListQueryDto,
  CampaignOrganizationsResponseDto,
  CampaignResultsResponseDto,
  CampaignsListResponseDto,
  ChangeCampaignStatusDto,
  CreateCampaignDto,
  TargetOrganizationsDto,
  TargetOrganizationsResponseDto,
  UpdateCampaignDto,
} from './dto/campaign.dto';

const swagger = ApiMessages.swagger;

/** US-01-11 — campaigns: a frozen target list, worked and measured. */
@ApiTags(swagger.campaigns.tag)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@ApiAuthResponses()
@UseGuards(JwtAuthGuard, ProjectGuard, PermissionsGuard)
@ProjectScoped()
@ApiHeader({ name: PROJECT_ID_HEADER, description: swagger.projectIdHeaderDesc, required: true })
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  @Permissions({ code: 'campaigns:read' })
  @ApiOperation(swagger.campaigns.list)
  @ApiListResponse(CampaignsListResponseDto)
  findAll(@CurrentProjectId() projectId: string, @Query() query: CampaignListQueryDto): Promise<CampaignsListResponseDto> {
    return this.campaignsService.findAll(projectId, query);
  }

  @Post()
  @Permissions({ code: 'campaigns:create' })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation(swagger.campaigns.create)
  @ApiPostResponse(CampaignIdResponseDto)
  create(
    @CurrentProjectId() projectId: string,
    @Body() dto: CreateCampaignDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CampaignIdResponseDto> {
    return this.campaignsService.create(projectId, dto, user);
  }

  @Patch(':id')
  @Permissions({ code: 'campaigns:update' })
  @ApiOperation(swagger.campaigns.update)
  @ApiCuidParam('id', swagger.params.campaignId)
  @ApiPatchResponse(CampaignDto)
  update(
    @CurrentProjectId() projectId: string,
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: UpdateCampaignDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CampaignDto> {
    return this.campaignsService.update(id, projectId, dto, user);
  }

  @Post(':id/status')
  @Permissions({ code: 'campaigns:update' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation(swagger.campaigns.changeStatus)
  @ApiCuidParam('id', swagger.params.campaignId)
  @ApiPatchResponse(CampaignDto)
  changeStatus(
    @CurrentProjectId() projectId: string,
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: ChangeCampaignStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CampaignDto> {
    return this.campaignsService.changeStatus(id, projectId, dto, user);
  }

  @Post(':id/organizations')
  @Permissions({ code: 'campaigns:update' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation(swagger.campaigns.addOrganizations)
  @ApiCuidParam('id', swagger.params.campaignId)
  @ApiPatchResponse(TargetOrganizationsResponseDto)
  addOrganizations(
    @CurrentProjectId() projectId: string,
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: TargetOrganizationsDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TargetOrganizationsResponseDto> {
    return this.campaignsService.addOrganizations(id, projectId, dto, user);
  }

  @Delete(':id/organizations/:orgId')
  @Permissions({ code: 'campaigns:update' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation(swagger.campaigns.removeOrganization)
  @ApiCuidParam('id', swagger.params.campaignId)
  @ApiCuidParam('orgId', swagger.params.organizationId)
  @ApiDeleteResponse()
  removeOrganization(
    @CurrentProjectId() projectId: string,
    @Param('id', ParseCuidPipe) id: string,
    @Param('orgId', ParseCuidPipe) orgId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.campaignsService.removeOrganization(id, orgId, projectId, user);
  }

  @Get(':id/organizations')
  @Permissions({ code: 'campaigns:read' })
  @ApiOperation(swagger.campaigns.listOrganizations)
  @ApiCuidParam('id', swagger.params.campaignId)
  @ApiListResponse(CampaignOrganizationsResponseDto)
  listOrganizations(
    @CurrentProjectId() projectId: string,
    @Param('id', ParseCuidPipe) id: string,
    @Query() query: CampaignListQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CampaignOrganizationsResponseDto> {
    return this.campaignsService.listOrganizations(id, projectId, query, user);
  }

  @Get(':id/results')
  @Permissions({ code: 'campaigns:read' })
  @ApiOperation(swagger.campaigns.results)
  @ApiCuidParam('id', swagger.params.campaignId)
  @ApiListResponse(CampaignResultsResponseDto)
  results(
    @CurrentProjectId() projectId: string,
    @Param('id', ParseCuidPipe) id: string,
    @Query() query: CampaignListQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CampaignResultsResponseDto> {
    return this.campaignsService.results(id, projectId, query, user);
  }

  @Delete(':id')
  @Permissions({ code: 'campaigns:delete' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation(swagger.campaigns.delete)
  @ApiCuidParam('id', swagger.params.campaignId)
  @ApiDeleteResponse()
  remove(
    @CurrentProjectId() projectId: string,
    @Param('id', ParseCuidPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.campaignsService.remove(id, projectId, user);
  }
}
