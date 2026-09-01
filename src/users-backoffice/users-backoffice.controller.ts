import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import { Permissions } from '@/auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guards';
import { PermissionsGuard } from '@/auth/guards/permissions.guard';
import { AuthenticatedUser } from '@/auth/interfaces/authenticated-user.interface';
import { SWAGGER_BEARER_AUTH } from '@/common/constants/app.constants';
import { ApiCuidParam, ApiDeleteResponse, ApiGetById, ApiListResponse, ApiPatchResponse, ApiPostResponse, ApiAuthResponses, ApiActionResponses } from '@/common/decorators';
import { ApiMessages } from '@/common/messages';
import { ParseCuidPipe } from '@/common/pipes';
import { CreateBackofficeUserDto, CreateBackofficeUserResponseDto } from './dto/create-user-backoffice.dto';
import { BackofficeUserListQueryDto } from './dto/query-user-backoffice-list.dto';
import { BackofficeRolesResponseDto, BackofficeUserListResponseDto, BackofficeUserResponseDto } from './dto/response-user-backoffice.dto';
import { UpdateBackofficeUserDto } from './dto/update-user-backoffice.dto';
import { UsersBackofficeService } from './users-backoffice.service';

const swagger = ApiMessages.swagger;

/** US-00-11 — platform routes (no x-project-id): backoffice accounts, same shape as soft-m /backoffice/users. */
@ApiTags(swagger.usersBackoffice.tag)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@ApiAuthResponses()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('backoffice')
export class UsersBackofficeController {
  constructor(private readonly usersBackofficeService: UsersBackofficeService) {}

  @Get('roles')
  @Permissions({ code: 'userBackoffice:read' })
  @ApiOperation(swagger.usersBackoffice.roles)
  @ApiListResponse(BackofficeRolesResponseDto)
  roles(): Promise<BackofficeRolesResponseDto> {
    return this.usersBackofficeService.roles();
  }

  @Get('users')
  @Permissions({ code: 'userBackoffice:read' })
  @ApiOperation(swagger.usersBackoffice.list)
  @ApiListResponse(BackofficeUserListResponseDto)
  findAll(@Query() query: BackofficeUserListQueryDto): Promise<BackofficeUserListResponseDto> {
    return this.usersBackofficeService.findAll(query);
  }

  @Get('users/:id')
  @Permissions({ code: 'userBackoffice:read' })
  @ApiOperation(swagger.usersBackoffice.findOne)
  @ApiGetById('id', swagger.params.userId, BackofficeUserResponseDto)
  findOne(@Param('id', ParseCuidPipe) id: string): Promise<BackofficeUserResponseDto> {
    return this.usersBackofficeService.findOne(id);
  }

  @Post('users')
  @Permissions({ code: 'userBackoffice:create' })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation(swagger.usersBackoffice.create)
  @ApiPostResponse(CreateBackofficeUserResponseDto)
  create(@Body() dto: CreateBackofficeUserDto, @CurrentUser() actor: AuthenticatedUser): Promise<CreateBackofficeUserResponseDto> {
    return this.usersBackofficeService.create(dto, actor);
  }

  @Patch('users/:id')
  @Permissions({ code: 'userBackoffice:update' })
  @ApiOperation(swagger.usersBackoffice.update)
  @ApiCuidParam('id', swagger.params.userId)
  @ApiPatchResponse(BackofficeUserResponseDto)
  update(
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: UpdateBackofficeUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<BackofficeUserResponseDto> {
    return this.usersBackofficeService.update(id, dto, actor);
  }

  @Post('users/:id/resend-activation')
  @Permissions({ code: 'userBackoffice:update' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation(swagger.usersBackoffice.resendActivation)
  @ApiCuidParam('id', swagger.params.userId)
  @ApiOkResponse({ description: swagger.responses.success })
  @ApiActionResponses()
  resendActivation(@Param('id', ParseCuidPipe) id: string, @CurrentUser() actor: AuthenticatedUser): Promise<{ sent: boolean }> {
    return this.usersBackofficeService.resendActivation(id, actor);
  }

  @Delete('users/:id')
  @Permissions({ code: 'userBackoffice:delete' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation(swagger.usersBackoffice.delete)
  @ApiCuidParam('id', swagger.params.userId)
  @ApiDeleteResponse()
  remove(@Param('id', ParseCuidPipe) id: string, @CurrentUser() actor: AuthenticatedUser): Promise<void> {
    return this.usersBackofficeService.suspend(id, actor);
  }
}
