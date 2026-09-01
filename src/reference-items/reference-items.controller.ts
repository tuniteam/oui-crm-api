import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
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
import { ApiCuidParam, ApiListResponse, ApiPatchResponse, ApiPostResponse, ApiAuthResponses } from '@/common/decorators';
import { ApiMessages } from '@/common/messages';
import { ParseCuidPipe } from '@/common/pipes';
import { CreateReferenceItemDto, ReferenceItemIdResponseDto } from './dto/create-reference-item.dto';
import { QueryReferenceItemsDto } from './dto/query-reference-items.dto';
import { ReferenceItemResponseDto, ReferenceItemsListResponseDto } from './dto/response-reference-item.dto';
import { UpdateReferenceItemDto } from './dto/update-reference-item.dto';
import { ReferenceItemsService } from './reference-items.service';

const swagger = ApiMessages.swagger;

/** US-00-09 — reference values of the current project. */
@ApiTags(swagger.referenceItems.tag)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@ApiAuthResponses()
@UseGuards(JwtAuthGuard, ProjectGuard, PermissionsGuard)
@ProjectScoped()
@ApiHeader({ name: PROJECT_ID_HEADER, description: swagger.projectIdHeaderDesc, required: true })
@Controller('reference-items')
export class ReferenceItemsController {
  constructor(private readonly referenceItemsService: ReferenceItemsService) {}

  @Get()
  @Permissions({ code: 'references:read' })
  @ApiOperation(swagger.referenceItems.list)
  @ApiListResponse(ReferenceItemsListResponseDto)
  findAll(@CurrentProjectId() projectId: string, @Query() query: QueryReferenceItemsDto): Promise<ReferenceItemsListResponseDto> {
    return this.referenceItemsService.findAll(projectId, query);
  }

  @Post()
  @Permissions({ code: 'references:update' })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation(swagger.referenceItems.create)
  @ApiPostResponse(ReferenceItemIdResponseDto)
  create(
    @CurrentProjectId() projectId: string,
    @Body() dto: CreateReferenceItemDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ReferenceItemIdResponseDto> {
    return this.referenceItemsService.create(projectId, dto, actor);
  }

  @Patch(':id')
  @Permissions({ code: 'references:update' })
  @ApiOperation(swagger.referenceItems.update)
  @ApiCuidParam('id', swagger.params.referenceItemId)
  @ApiPatchResponse(ReferenceItemResponseDto)
  update(
    @CurrentProjectId() projectId: string,
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: UpdateReferenceItemDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ReferenceItemResponseDto> {
    return this.referenceItemsService.update(projectId, id, dto, actor);
  }
}
