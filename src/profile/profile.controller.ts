import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guards';
import { AuthenticatedUser } from '@/auth/interfaces/authenticated-user.interface';
import { ApiDeleteResponse, ApiGetResponse, ApiPatchResponse, ApiAuthResponses, ApiInvalidData } from '@/common/decorators';
import { SWAGGER_BEARER_AUTH } from '@/common/constants/app.constants';
import { ApiMessages } from '@/common/messages';
import { AvatarResponseDto } from './dto/avatar-response.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { MeResponseDto } from './dto/me-response.dto';
import { ProfileCoreResponseDto, UpdateProfileDto } from './dto/update-profile.dto';
import { UploadedFileLike } from '@/files/uploaded-file.interface';
import { SuccessResponseDto } from '@/auth/dto/success-response.dto';
import { MAX_SIZE_BY_CATEGORY, UPLOAD_FIELD } from '@/files/files.constants';
import { ProfileService } from './profile.service';

const swagger = ApiMessages.swagger;

/**
 * US-00-03 — account-level routes: JwtAuthGuard only, never x-project-id
 * (approved guard combination, backend-dev skill).
 */
@ApiTags(swagger.profile.tag)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@ApiAuthResponses()
@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('me')
  @ApiOperation(swagger.profile.me)
  @ApiGetResponse(MeResponseDto)
  getMe(@CurrentUser() user: AuthenticatedUser): Promise<MeResponseDto> {
    return this.profileService.getMe(user.id);
  }

  @Patch()
  @ApiOperation(swagger.profile.update)
  @ApiPatchResponse(ProfileCoreResponseDto)
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<ProfileCoreResponseDto> {
    return this.profileService.updateProfile(user.id, dto);
  }

  @Patch('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation(swagger.profile.changePassword)
  @ApiBody({ type: ChangePasswordDto })
  @ApiOkResponse({ type: SuccessResponseDto })
  @ApiInvalidData()
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<SuccessResponseDto> {
    await this.profileService.changePassword(user.id, user.sessionId, dto);
    return { success: true };
  }

  @Patch('avatar')
  @ApiConsumes('multipart/form-data')
  @ApiOperation(swagger.profile.uploadAvatar)
  @ApiPatchResponse(AvatarResponseDto)
  // Cap the multipart body before it is buffered — FileService re-checks per category
  @UseInterceptors(FileInterceptor(UPLOAD_FIELD, { limits: { fileSize: MAX_SIZE_BY_CATEGORY.AVATAR } }))
  updateAvatar(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: UploadedFileLike | undefined,
  ): Promise<AvatarResponseDto> {
    return this.profileService.updateAvatar(user.id, file);
  }

  @Delete('avatar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation(swagger.profile.deleteAvatar)
  @ApiDeleteResponse()
  async deleteAvatar(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.profileService.deleteAvatar(user.id, user);
  }
}
