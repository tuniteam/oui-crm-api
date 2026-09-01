import { Controller, Delete, Get, HttpCode, HttpStatus, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guards';
import { AuthenticatedUser } from '@/auth/interfaces/authenticated-user.interface';
import {
  ApiCuidParam,
  ApiDeleteResponse, ApiGetResponse, ApiMessages, ParseCuidPipe,
} from '@/common';
import { SWAGGER_BEARER_AUTH } from '@/common/constants/app.constants';
import { ApiAuthResponses } from '@/common/decorators';
import { FileService } from './file.service';
import { FileDownloadResponseDto } from './dto/response-file-download.dto';

const swagger = ApiMessages.swagger;

/**
 * Generic file access. Authorization is resolved per file from its project and category
 * (FileService.canRead / canDelete), so these routes carry no x-project-id header and no
 * @Permissions — an approved exception to the guard triple (backend-dev skill, 31/08/2026).
 */
@ApiTags(swagger.files.tag)
@Controller('files')
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@ApiAuthResponses()
@UseGuards(JwtAuthGuard)
export class FilesController {
  constructor(private readonly fileService: FileService) {}

  @Get(':fileId/download')
  @ApiCuidParam('fileId', swagger.params.fileId)
  @ApiOperation(swagger.files.download)
  @ApiGetResponse(FileDownloadResponseDto)
  download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('fileId', ParseCuidPipe) fileId: string,
  ): Promise<FileDownloadResponseDto> {
    return this.fileService.getDownloadUrl(fileId, user);
  }

  @Delete(':fileId')
  @ApiCuidParam('fileId', swagger.params.fileId)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation(swagger.files.delete)
  @ApiDeleteResponse()
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('fileId', ParseCuidPipe) fileId: string,
  ): Promise<void> {
    await this.fileService.delete(fileId, user);
  }
}
