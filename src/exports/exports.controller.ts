import { Body, Controller, HttpCode, HttpStatus, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
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
import { ApiAuthResponses } from '@/common/decorators';
import { sendFileAttachment } from '@/common/helper/file-response.helper';
import { ApiMessages } from '@/common/messages';
import { ExportOrganizationsDto } from './dto/export-organizations.dto';
import { ExportsService } from './exports.service';

const swagger = ApiMessages.swagger;

/** US-01-07 — the filtered organization list as a commercial file (synchronous at L1). */
@ApiTags(swagger.exports.tag)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@ApiAuthResponses()
@UseGuards(JwtAuthGuard, ProjectGuard, PermissionsGuard)
@ProjectScoped()
@ApiHeader({ name: PROJECT_ID_HEADER, description: swagger.projectIdHeaderDesc, required: true })
@Controller('exports')
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Post('organizations-list')
  @Permissions({ code: 'organizations:export' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation(swagger.exports.organizationsList)
  @ApiProduces(MIME.CSV, MIME.XLSX)
  @ApiOkResponse({ description: swagger.responses.attachment })
  async organizationsList(
    @CurrentProjectId() projectId: string,
    @Body() dto: ExportOrganizationsDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.exportsService.organizationsList(projectId, dto, user);
    sendFileAttachment(res, file);
  }
}
