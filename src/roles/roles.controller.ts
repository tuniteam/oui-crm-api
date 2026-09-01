import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
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
import { ApiCuidParam, ApiDeleteResponse, ApiListResponse, ApiPatchResponse, ApiPostResponse } from '@/common/decorators';
import { ApiMessages } from '@/common/messages';
import { ParseCuidPipe } from '@/common/pipes';
import { DuplicateRoleDto, DuplicateRoleResponseDto } from './dto/duplicate-role.dto';
import { PermissionsListResponseDto, RoleResponseDto, RolesListResponseDto } from './dto/response-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RolesService } from './roles.service';

const swagger = ApiMessages.swagger;

/** US-00-06 — role matrix of the current project. */
@ApiTags(swagger.roles.tag)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@UseGuards(JwtAuthGuard, ProjectGuard, PermissionsGuard)
@ProjectScoped()
@ApiHeader({ name: PROJECT_ID_HEADER, description: swagger.projectIdHeaderDesc, required: true })
@Controller()
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get('roles')
  @Permissions({ code: 'roles:read' })
  @ApiOperation(swagger.roles.list)
  @ApiListResponse(RolesListResponseDto)
  findAll(@CurrentProjectId() projectId: string): Promise<RolesListResponseDto> {
    return this.rolesService.findAll(projectId);
  }

  @Get('permissions')
  @Permissions({ code: 'roles:read' })
  @ApiOperation(swagger.roles.permissions)
  @ApiListResponse(PermissionsListResponseDto)
  findPermissions(): Promise<PermissionsListResponseDto> {
    return this.rolesService.findPermissions();
  }

  @Post('roles/:id/duplicate')
  @Permissions({ code: 'roles:update' })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation(swagger.roles.duplicate)
  @ApiCuidParam('id', swagger.params.roleId)
  @ApiBody({ type: DuplicateRoleDto })
  @ApiPostResponse(DuplicateRoleResponseDto)
  duplicate(
    @CurrentProjectId() projectId: string,
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: DuplicateRoleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<DuplicateRoleResponseDto> {
    return this.rolesService.duplicate(projectId, id, dto, actor);
  }

  @Patch('roles/:id')
  @Permissions({ code: 'roles:update' })
  @ApiOperation(swagger.roles.update)
  @ApiCuidParam('id', swagger.params.roleId)
  @ApiPatchResponse(RoleResponseDto)
  update(
    @CurrentProjectId() projectId: string,
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<RoleResponseDto> {
    return this.rolesService.update(projectId, id, dto, actor);
  }

  @Delete('roles/:id')
  @Permissions({ code: 'roles:update' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation(swagger.roles.delete)
  @ApiCuidParam('id', swagger.params.roleId)
  @ApiDeleteResponse()
  remove(
    @CurrentProjectId() projectId: string,
    @Param('id', ParseCuidPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    return this.rolesService.remove(projectId, id, actor);
  }
}
