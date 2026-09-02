import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
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
import {
  ApiAuthResponses,
  ApiCuidParam,
  ApiDeleteResponse,
  ApiGetResponse,
  ApiListResponse,
  ApiPatchResponse,
  ApiPostResponse,
} from '@/common/decorators';
import { ApiMessages } from '@/common/messages';
import { ParseCuidPipe } from '@/common/pipes';
import {
  BulkResultDto,
  BulkActionDto,
  ChangeSalesStatusResponseDto,
  ChangeSalesStatusDto,
  BoardResponseDto,
  CreateOrganizationDto,
  CreateOrganizationResponseDto,
  OrganizationDetailDto,
  OrganizationListItemDto,
  OrganizationListQueryDto,
  OrganizationListResponseDto,
  UpdateOrganizationDto,
} from './dto';
import { OrganizationsService } from './organizations.service';
import { RegistrySearchQueryDto, RegistrySearchResponseDto } from './dto/registry-search.dto';
import { RegistryService } from './registry.service';

const swagger = ApiMessages.swagger;

@ApiTags(swagger.organizations.tag)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@ApiAuthResponses()
@UseGuards(JwtAuthGuard, ProjectGuard, PermissionsGuard)
@ProjectScoped()
@ApiHeader({ name: PROJECT_ID_HEADER, description: swagger.projectIdHeaderDesc, required: true })
@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly registryService: RegistryService,
  ) {}

  @Get()
  @Permissions({ code: 'organizations:read' })
  @ApiOperation(swagger.organizations.list)
  @ApiListResponse(OrganizationListResponseDto)
  findAll(
    @Query() query: OrganizationListQueryDto,
    @CurrentProjectId() projectId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrganizationListResponseDto> {
    return this.organizationsService.findAll(projectId, query, user);
  }

  @Post('bulk')
  @Permissions({ code: 'organizations:bulk', ownerField: 'salesRepId' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation(swagger.organizations.bulk)
  @ApiPatchResponse(BulkResultDto)
  bulk(
    @CurrentProjectId() projectId: string,
    @Body() dto: BulkActionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BulkResultDto> {
    return this.organizationsService.bulk(projectId, dto, user);
  }

  @Get('board')
  @Permissions({ code: 'organizations:read' })
  @ApiOperation(swagger.organizations.board)
  @ApiListResponse(BoardResponseDto)
  board(@CurrentProjectId() projectId: string, @CurrentUser() user: AuthenticatedUser): Promise<BoardResponseDto> {
    return this.organizationsService.board(projectId, user);
  }

  @Get('search-registry')
  @Permissions({ code: 'organizations:create' })
  @ApiOperation(swagger.organizations.searchRegistry)
  @ApiListResponse(RegistrySearchResponseDto)
  searchRegistry(@Query() query: RegistrySearchQueryDto): Promise<RegistrySearchResponseDto> {
    return this.registryService.search(query.q);
  }

  @Get(':id')
  @Permissions({ code: 'organizations:read' })
  @ApiOperation(swagger.organizations.findOne)
  @ApiCuidParam('id', swagger.params.organizationId)
  @ApiGetResponse(OrganizationDetailDto)
  findOne(
    @Param('id', ParseCuidPipe) id: string,
    @CurrentProjectId() projectId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrganizationDetailDto | OrganizationListItemDto> {
    return this.organizationsService.findOne(id, projectId, user);
  }

  @Post()
  @Permissions({ code: 'organizations:create' })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation(swagger.organizations.create)
  @ApiBody({ type: CreateOrganizationDto })
  @ApiPostResponse(CreateOrganizationResponseDto)
  create(
    @Body() dto: CreateOrganizationDto,
    @CurrentProjectId() projectId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CreateOrganizationResponseDto> {
    return this.organizationsService.create(dto, projectId, user);
  }

  @Patch(':id')
  @Permissions({ code: 'organizations:update' })
  @ApiOperation(swagger.organizations.update)
  @ApiCuidParam('id', swagger.params.organizationId)
  @ApiBody({ type: UpdateOrganizationDto })
  @ApiPatchResponse(OrganizationDetailDto)
  update(
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: UpdateOrganizationDto,
    @CurrentProjectId() projectId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrganizationDetailDto | OrganizationListItemDto> {
    return this.organizationsService.update(id, dto, projectId, user);
  }

  @Post(':id/sales-status')
  @Permissions({ code: 'organizations:update' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation(swagger.organizations.changeSalesStatus)
  @ApiCuidParam('id', swagger.params.organizationId)
  @ApiPatchResponse(ChangeSalesStatusResponseDto)
  changeSalesStatus(
    @CurrentProjectId() projectId: string,
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: ChangeSalesStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ChangeSalesStatusResponseDto> {
    return this.organizationsService.changeSalesStatus(id, dto, projectId, user);
  }

  @Delete(':id')
  @Permissions({ code: 'organizations:delete' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation(swagger.organizations.remove)
  @ApiCuidParam('id', swagger.params.organizationId)
  @ApiDeleteResponse()
  remove(
    @Param('id', ParseCuidPipe) id: string,
    @CurrentProjectId() projectId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.organizationsService.remove(id, projectId, user);
  }
}
