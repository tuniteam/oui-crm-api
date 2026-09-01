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
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentProjectId } from '@/auth/decorators/current-project.decorator';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import { Permissions } from '@/auth/decorators/permissions.decorator';
import { ProjectScoped } from '@/auth/decorators/project-scoped.decorator';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guards';
import { PermissionsGuard } from '@/auth/guards/permissions.guard';
import { ProjectGuard } from '@/auth/guards/project.guard';
import { AuthenticatedUser } from '@/auth/interfaces/authenticated-user.interface';
import { PROJECT_ID_HEADER } from '@/auth/auth.constants';
import { ApiCuidParam, ApiGetById, ApiListResponse, ApiPatchResponse, ApiPostResponse, ApiDeleteResponse, ApiAuthResponses, ApiActionResponses } from '@/common/decorators';
import { SWAGGER_BEARER_AUTH } from '@/common/constants/app.constants';
import { ApiMessages } from '@/common/messages';
import { ParseCuidPipe } from '@/common/pipes';
import { CreateUserDto, CreateUserResponseDto } from './dto/create-user.dto';
import { UserListQueryDto } from './dto/query-user-list.dto';
import { UserDetailResponseDto, UserListResponseDto } from './dto/response-user.dto';
import { SetOverridesDto } from './dto/set-overrides.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

const swagger = ApiMessages.swagger;

/** US-00-05 — project-scoped user administration. */
@ApiTags(swagger.users.tag)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@ApiAuthResponses()
@UseGuards(JwtAuthGuard, ProjectGuard, PermissionsGuard)
@ProjectScoped()
@ApiHeader({ name: PROJECT_ID_HEADER, description: swagger.projectIdHeaderDesc, required: true })
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Permissions({ code: 'users:read' })
  @ApiOperation(swagger.users.list)
  @ApiListResponse(UserListResponseDto)
  findAll(@CurrentProjectId() projectId: string, @Query() query: UserListQueryDto): Promise<UserListResponseDto> {
    return this.usersService.findAll(projectId, query);
  }

  @Post()
  @Permissions({ code: 'users:create' })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation(swagger.users.create)
  @ApiPostResponse(CreateUserResponseDto)
  create(
    @CurrentProjectId() projectId: string,
    @Body() dto: CreateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<CreateUserResponseDto> {
    return this.usersService.create(projectId, dto, actor);
  }

  @Get(':id')
  @Permissions({ code: 'users:read' })
  @ApiOperation(swagger.users.findOne)
  @ApiGetById('id', swagger.params.userId, UserDetailResponseDto)
  findOne(
    @CurrentProjectId() projectId: string,
    @Param('id', ParseCuidPipe) id: string,
  ): Promise<UserDetailResponseDto> {
    return this.usersService.findOne(projectId, id);
  }

  @Patch(':id')
  @Permissions({ code: 'users:update' })
  @ApiOperation(swagger.users.update)
  @ApiCuidParam('id', swagger.params.userId)
  @ApiPatchResponse(UserDetailResponseDto)
  update(
    @CurrentProjectId() projectId: string,
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<UserDetailResponseDto> {
    return this.usersService.update(projectId, id, dto, actor);
  }

  @Patch(':id/overrides')
  @Permissions({ code: 'users:update' })
  @ApiOperation(swagger.users.overrides)
  @ApiCuidParam('id', swagger.params.userId)
  @ApiBody({ type: SetOverridesDto })
  @ApiPatchResponse(UserDetailResponseDto)
  setOverrides(
    @CurrentProjectId() projectId: string,
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: SetOverridesDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<UserDetailResponseDto> {
    return this.usersService.setOverrides(projectId, id, dto, actor);
  }

  @Post(':id/resend-activation')
  @Permissions({ code: 'users:update' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation(swagger.users.resendActivation)
  @ApiCuidParam('id', swagger.params.userId)
  @ApiOkResponse({ description: swagger.responses.success })
  @ApiActionResponses()
  resendActivation(
    @CurrentProjectId() projectId: string,
    @Param('id', ParseCuidPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<{ sent: boolean }> {
    return this.usersService.resendActivation(projectId, id, actor);
  }

  @Delete(':id')
  @Permissions({ code: 'users:delete' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation(swagger.users.delete)
  @ApiDeleteResponse()
  @ApiCuidParam('id', swagger.params.userId)
  suspend(
    @CurrentProjectId() projectId: string,
    @Param('id', ParseCuidPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    return this.usersService.suspend(projectId, id, actor);
  }
}
