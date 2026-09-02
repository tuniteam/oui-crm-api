import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiHeader, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
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
import { MIME } from '@/common/constants/mime.constants';
import { ApiAuthResponses, ApiCuidParam, ApiDeleteResponse, ApiPatchResponse } from '@/common/decorators';
import { sendFileAttachment } from '@/common/helper/file-response.helper';
import { ApiMessages } from '@/common/messages';
import { ParseCuidPipe } from '@/common/pipes';
import { MAX_SIZE_BY_CATEGORY } from '@/files/files.constants';
import { UploadedFileLike } from '@/files/uploaded-file.interface';
import { ImportFileQueryDto, ImportReportDto, ImportTemplateQueryDto } from './dto/import-file.dto';
import { IMPORT_FILE } from './import-file.constants';
import { ImportFileService } from './import-file.service';
import { ImportReportPdfService } from './import-report-pdf.service';
import { ImportService } from './import.service';

const swagger = ApiMessages.swagger;

/**
 * US-01-06/14 — file import and batch lifecycle. The template and run routes carry no
 * `@Permissions` on purpose: the permission depends on the profile (GENERIC →
 * organizations:import, PROJECT_CONFIG → settings+references+scopes:update) and is asserted
 * by ImportFileService before anything is read.
 */
@ApiTags(swagger.imports.tag)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@ApiAuthResponses()
@UseGuards(JwtAuthGuard, ProjectGuard, PermissionsGuard)
@ProjectScoped()
@ApiHeader({ name: PROJECT_ID_HEADER, description: swagger.projectIdHeaderDesc, required: true })
@Controller('import')
export class ImportController {
  constructor(
    private readonly importService: ImportService,
    private readonly importFileService: ImportFileService,
    private readonly reportPdf: ImportReportPdfService,
  ) {}

  @Get('template')
  @ApiOperation(swagger.imports.template)
  @ApiProduces(MIME.XLSX)
  @ApiOkResponse({ description: swagger.responses.attachment })
  async template(
    @CurrentProjectId() projectId: string,
    @Query() query: ImportTemplateQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.importFileService.template(projectId, query.profile, user);
    sendFileAttachment(res, file);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor(IMPORT_FILE.UPLOAD_FIELD, { limits: { fileSize: MAX_SIZE_BY_CATEGORY.IMPORT_SOURCE } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation(swagger.imports.run)
  @ApiPatchResponse(ImportReportDto)
  run(
    @CurrentProjectId() projectId: string,
    @Query() query: ImportFileQueryDto,
    @UploadedFile() file: UploadedFileLike | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ImportReportDto> {
    return this.importFileService.run(projectId, query, file, user);
  }

  @Post('errors-pdf')
  @Permissions({ code: 'organizations:import' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation(swagger.imports.errorsPdf)
  @ApiProduces(MIME.PDF)
  @ApiOkResponse({ description: swagger.responses.attachment })
  async errorsPdf(@Body() report: ImportReportDto, @Res() res: Response): Promise<void> {
    const file = await this.reportPdf.render(report);
    sendFileAttachment(res, file);
  }

  @Delete('batches/:batchId')
  @Permissions({ code: 'organizations:import' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation(swagger.imports.cancelBatch)
  @ApiCuidParam('batchId', swagger.params.importBatchId)
  @ApiDeleteResponse()
  cancelBatch(
    @CurrentProjectId() projectId: string,
    @Param('batchId', ParseCuidPipe) batchId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.importService.cancelBatch(projectId, batchId, user);
  }
}
