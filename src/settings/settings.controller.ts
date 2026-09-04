import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiHeader, ApiOkResponse, ApiOperation, ApiParam, ApiProduces, ApiTags } from '@nestjs/swagger';
import { DocumentTemplateType } from '@prisma/client';
import { PROJECT_ID_HEADER } from '@/auth/auth.constants';
import { CurrentProjectId } from '@/auth/decorators/current-project.decorator';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import { Permissions } from '@/auth/decorators/permissions.decorator';
import { ProjectScoped } from '@/auth/decorators/project-scoped.decorator';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guards';
import { PermissionsGuard } from '@/auth/guards/permissions.guard';
import { ProjectGuard } from '@/auth/guards/project.guard';
import { AuthenticatedUser } from '@/auth/interfaces/authenticated-user.interface';
import { Res } from '@nestjs/common';
import { Response } from 'express';
import { apiError } from '@/common/api-error';
import { MIME } from '@/common/constants/mime.constants';
import { sendFileAttachment } from '@/common/helper/file-response.helper';
import { SWAGGER_BEARER_AUTH } from '@/common/constants/app.constants';
import { ApiDeleteResponse, ApiGetResponse, ApiPatchResponse, ApiPostResponse, ApiAuthResponses, ApiResourceNotFound } from '@/common/decorators';
import { ApiMessages } from '@/common/messages';
import { MAX_SIZE_BY_CATEGORY, UPLOAD_FIELD } from '@/files/files.constants';
import { UploadedFileLike } from '@/files/uploaded-file.interface';
import { DocumentsResponseDto, SignatureUploadResponseDto, TemplateUploadResponseDto } from './dto/response-documents.dto';
import { SettingsResponseDto } from './dto/response-settings.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { SettingsService } from './settings.service';

const swagger = ApiMessages.swagger;
const templateTypePipe = new ParseEnumPipe(DocumentTemplateType, { exceptionFactory: () => apiError.badRequest('INVALID_DATA') });

/** US-00-08 — settings, document templates and signature image of the current project. */
@ApiTags(swagger.settings.tag)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@ApiAuthResponses()
@UseGuards(JwtAuthGuard, ProjectGuard, PermissionsGuard)
@ProjectScoped()
@ApiHeader({ name: PROJECT_ID_HEADER, description: swagger.projectIdHeaderDesc, required: true })
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @Permissions({ code: 'settings:read' })
  @ApiOperation(swagger.settings.get)
  @ApiGetResponse(SettingsResponseDto)
  get(@CurrentProjectId() projectId: string): Promise<SettingsResponseDto> {
    return this.settingsService.get(projectId);
  }

  @Patch()
  @Permissions({ code: 'settings:update' })
  @ApiOperation(swagger.settings.update)
  @ApiPatchResponse(SettingsResponseDto)
  update(
    @CurrentProjectId() projectId: string,
    @Body() dto: UpdateSettingsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<SettingsResponseDto> {
    return this.settingsService.update(projectId, dto, actor);
  }

  @Get('documents')
  @Permissions({ code: 'settings:read' })
  @ApiOperation(swagger.settings.documents)
  @ApiGetResponse(DocumentsResponseDto)
  documents(@CurrentProjectId() projectId: string, @CurrentUser() actor: AuthenticatedUser): Promise<DocumentsResponseDto> {
    return this.settingsService.documents(projectId, actor);
  }

  @Post('documents/:type')
  @Permissions({ code: 'settings:update' })
  @HttpCode(HttpStatus.CREATED)
  @ApiConsumes('multipart/form-data')
  @ApiOperation(swagger.settings.uploadTemplate)
  @ApiParam({ name: 'type', enum: DocumentTemplateType, description: swagger.params.templateType })
  @ApiPostResponse(TemplateUploadResponseDto)
  @ApiResourceNotFound()
  // Cap the multipart body before it is buffered — FileService re-checks per category
  @UseInterceptors(FileInterceptor(UPLOAD_FIELD, { limits: { fileSize: MAX_SIZE_BY_CATEGORY.HTML_TEMPLATE } }))
  uploadTemplate(
    @CurrentProjectId() projectId: string,
    @Param('type', templateTypePipe) type: DocumentTemplateType,
    @UploadedFile() file: UploadedFileLike | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<TemplateUploadResponseDto> {
    return this.settingsService.uploadTemplate(projectId, type, file, actor);
  }

  /**
   * US-00-08 — juger un gabarit avant de le publier. Sans fichier, prévisualise le gabarit actif ;
   * avec un fichier, prévisualise **celui-là**, avant même de le téléverser. Données fictives,
   * cachet réel du projet.
   */
  @Post('documents/:type/preview')
  @Permissions({ code: 'settings:read' })
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @ApiOperation(swagger.settings.previewTemplate)
  @ApiParam({ name: 'type', enum: DocumentTemplateType, description: swagger.params.templateType })
  @ApiProduces(MIME.PDF)
  @ApiOkResponse({ description: swagger.responses.attachment })
  @UseInterceptors(FileInterceptor(UPLOAD_FIELD, { limits: { fileSize: MAX_SIZE_BY_CATEGORY.HTML_TEMPLATE } }))
  async previewTemplate(
    @CurrentProjectId() projectId: string,
    @Param('type', templateTypePipe) type: DocumentTemplateType,
    @UploadedFile() file: UploadedFileLike | undefined,
    @Res() res: Response,
  ): Promise<void> {
    sendFileAttachment(res, await this.settingsService.previewTemplate(projectId, type, file));
  }

  @Post('signature-image')
  @Permissions({ code: 'settings:update' })
  @HttpCode(HttpStatus.CREATED)
  @ApiConsumes('multipart/form-data')
  @ApiOperation(swagger.settings.uploadSignature)
  @ApiPostResponse(SignatureUploadResponseDto)
  @UseInterceptors(FileInterceptor(UPLOAD_FIELD, { limits: { fileSize: MAX_SIZE_BY_CATEGORY.SIGNATURE_IMAGE } }))
  uploadSignatureImage(
    @CurrentProjectId() projectId: string,
    @UploadedFile() file: UploadedFileLike | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<SignatureUploadResponseDto> {
    return this.settingsService.uploadSignatureImage(projectId, file, actor);
  }

  @Delete('signature-image')
  @Permissions({ code: 'settings:update' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation(swagger.settings.deleteSignature)
  @ApiDeleteResponse()
  deleteSignatureImage(@CurrentProjectId() projectId: string, @CurrentUser() actor: AuthenticatedUser): Promise<void> {
    return this.settingsService.deleteSignatureImage(projectId, actor);
  }
}
