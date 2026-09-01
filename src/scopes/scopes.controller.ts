import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
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
import { ApiCuidParam, ApiDeleteResponse, ApiListResponse, ApiPatchResponse, ApiPostResponse, ApiAuthResponses } from '@/common/decorators';
import { ApiMessages } from '@/common/messages';
import { ParseCuidPipe } from '@/common/pipes';
import { CreateScopeDto, ScopeIdResponseDto } from './dto/create-scope.dto';
import { GeoRegionsResponseDto, ScopeResponseDto, ScopesListResponseDto } from './dto/response-scope.dto';
import { UpdateScopeDto } from './dto/update-scope.dto';
import { ScopesService } from './scopes.service';

const swagger = ApiMessages.swagger;

/** US-00-07 — geographic scopes of the current project (+ static regions table). */
@ApiTags(swagger.scopes.tag)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@ApiAuthResponses()
@UseGuards(JwtAuthGuard, ProjectGuard, PermissionsGuard)
@ProjectScoped()
@ApiHeader({ name: PROJECT_ID_HEADER, description: swagger.projectIdHeaderDesc, required: true })
@Controller()
export class ScopesController {
  constructor(private readonly scopesService: ScopesService) {}

  @Get('scopes')
  @Permissions({ code: 'scopes:read' })
  @ApiOperation(swagger.scopes.list)
  @ApiListResponse(ScopesListResponseDto)
  findAll(@CurrentProjectId() projectId: string): Promise<ScopesListResponseDto> {
    return this.scopesService.findAll(projectId);
  }

  @Get('geo/regions')
  @Permissions({ code: 'scopes:read' })
  @ApiOperation(swagger.scopes.regions)
  @ApiListResponse(GeoRegionsResponseDto)
  regions(): GeoRegionsResponseDto {
    return this.scopesService.regions();
  }

  @Post('scopes')
  @Permissions({ code: 'scopes:update' })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation(swagger.scopes.create)
  @ApiPostResponse(ScopeIdResponseDto)
  create(
    @CurrentProjectId() projectId: string,
    @Body() dto: CreateScopeDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ScopeIdResponseDto> {
    return this.scopesService.create(projectId, dto, actor);
  }

  @Patch('scopes/:id')
  @Permissions({ code: 'scopes:update' })
  @ApiOperation(swagger.scopes.update)
  @ApiCuidParam('id', swagger.params.scopeId)
  @ApiPatchResponse(ScopeResponseDto)
  update(
    @CurrentProjectId() projectId: string,
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: UpdateScopeDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ScopeResponseDto> {
    return this.scopesService.update(projectId, id, dto, actor);
  }

  @Delete('scopes/:id')
  @Permissions({ code: 'scopes:update' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation(swagger.scopes.delete)
  @ApiCuidParam('id', swagger.params.scopeId)
  @ApiDeleteResponse()
  remove(
    @CurrentProjectId() projectId: string,
    @Param('id', ParseCuidPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    return this.scopesService.remove(projectId, id, actor);
  }
}
