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
import { ContactsService } from './contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { ContactDto, ContactsListResponseDto, ContactListQueryDto } from './dto/response-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

const swagger = ApiMessages.swagger;

/** US-01-04 — the interlocutors of an organization (FULL geographic access required). */
@ApiTags(swagger.contacts.tag)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@ApiAuthResponses()
@UseGuards(JwtAuthGuard, ProjectGuard, PermissionsGuard)
@ProjectScoped()
@ApiHeader({ name: PROJECT_ID_HEADER, description: swagger.projectIdHeaderDesc, required: true })
@Controller()
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get('organizations/:id/contacts')
  @Permissions({ code: 'contacts:read' })
  @ApiOperation(swagger.contacts.list)
  @ApiCuidParam('id', swagger.params.organizationId)
  @ApiListResponse(ContactsListResponseDto)
  findAll(
    @CurrentProjectId() projectId: string,
    @Param('id', ParseCuidPipe) organizationId: string,
    @Query() query: ContactListQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ContactsListResponseDto> {
    return this.contactsService.findAll(organizationId, projectId, query, user);
  }

  @Post('organizations/:id/contacts')
  @Permissions({ code: 'contacts:create' })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation(swagger.contacts.create)
  @ApiCuidParam('id', swagger.params.organizationId)
  @ApiPostResponse(ContactDto)
  create(
    @CurrentProjectId() projectId: string,
    @Param('id', ParseCuidPipe) organizationId: string,
    @Body() dto: CreateContactDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ContactDto> {
    return this.contactsService.create(organizationId, dto, projectId, user);
  }

  @Patch('contacts/:id')
  @Permissions({ code: 'contacts:update' })
  @ApiOperation(swagger.contacts.update)
  @ApiCuidParam('id', swagger.params.contactId)
  @ApiPatchResponse(ContactDto)
  update(
    @CurrentProjectId() projectId: string,
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: UpdateContactDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ContactDto> {
    return this.contactsService.update(id, dto, projectId, user);
  }

  @Delete('contacts/:id')
  @Permissions({ code: 'contacts:delete' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation(swagger.contacts.delete)
  @ApiCuidParam('id', swagger.params.contactId)
  @ApiDeleteResponse()
  remove(
    @CurrentProjectId() projectId: string,
    @Param('id', ParseCuidPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.contactsService.remove(id, projectId, user);
  }
}
