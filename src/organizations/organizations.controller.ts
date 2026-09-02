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
  CreateOrganizationDto,
  CreateOrganizationResponseDto,
  OrganizationDetailDto,
  OrganizationListItemDto,
  OrganizationListQueryDto,
  OrganizationListResponseDto,
  UpdateOrganizationDto,
} from './dto';
import { OrganizationsService } from './organizations.service';

const swagger = ApiMessages.swagger;

@ApiTags(swagger.organizations.tag)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@ApiAuthResponses()
@UseGuards(JwtAuthGuard, ProjectGuard, PermissionsGuard)
@ProjectScoped()
@ApiHeader({ name: PROJECT_ID_HEADER, description: swagger.projectIdHeaderDesc, required: true })
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

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
