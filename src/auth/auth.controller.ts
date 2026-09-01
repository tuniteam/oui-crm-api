import { Body, Controller, HttpCode, HttpStatus, Ip, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH } from '@/common/constants/app.constants';
import { ApiMessages } from '@/common/messages';
import { ApiAuthResponses, ApiInvalidData } from '@/common/decorators';
import { ActivationService } from './activation.service';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { ActivationCompleteDto } from './dto/activation-complete.dto';
import { ActivationValidateResponseDto } from './dto/activation-validate.dto';
import { AuthTokensResponseDto } from './dto/auth-tokens-response.dto';
import { EmailChangeConfirmResponseDto } from './dto/email-change-confirm.dto';
import { EmailChangeRequestDto } from './dto/email-change-request.dto';
import { LoginDto } from './dto/login.dto';
import { PasswordResetCompleteDto } from './dto/password-reset-complete.dto';
import { PasswordResetRequestDto } from './dto/password-reset-request.dto';
import { RefreshTokenDto } from './dto/refresh.dto';
import { SuccessResponseDto } from './dto/success-response.dto';
import { TokenDto, TokenValidResponseDto } from './dto/token.dto';
import { EmailChangeService } from './email-change.service';
import { JwtAuthGuard } from './guards/jwt-auth.guards';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import { PasswordResetService } from './password-reset.service';

const swagger = ApiMessages.swagger;

/**
 * SPEC-07 US-00-01 (login / refresh / logout) and US-00-02 (activation, password reset,
 * e-mail change). Public routes are rate-limited in main.ts.
 */
@ApiTags(swagger.auth.tag)
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly activationService: ActivationService,
    private readonly passwordResetService: PasswordResetService,
    private readonly emailChangeService: EmailChangeService,
  ) {}

  // ---------------------------------------------------------------- US-00-01

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation(swagger.auth.login)
  @ApiBody({ type: LoginDto })
  @ApiInvalidData()
  @ApiOkResponse({ type: AuthTokensResponseDto })
  login(@Body() dto: LoginDto, @Ip() ip: string): Promise<AuthTokensResponseDto> {
    return this.authService.login(dto, ip);
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation(swagger.auth.refresh)
  @ApiBody({ type: RefreshTokenDto })
  @ApiInvalidData()
  @ApiOkResponse({ type: AuthTokensResponseDto })
  refresh(@Body() dto: RefreshTokenDto): Promise<AuthTokensResponseDto> {
    return this.authService.refreshToken(dto.refreshToken);
  }

  @Post('logout')
  @ApiAuthResponses()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(SWAGGER_BEARER_AUTH)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation(swagger.auth.logout)
  async logout(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.authService.logout(user.sessionId);
  }

  // ---------------------------------------------------------------- US-00-02 activation

  @Post('activation/validate')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation(swagger.auth.activationValidate)
  @ApiBody({ type: TokenDto })
  @ApiInvalidData()
  @ApiOkResponse({ type: ActivationValidateResponseDto })
  validateActivation(@Body() dto: TokenDto): Promise<ActivationValidateResponseDto> {
    return this.activationService.validate(dto.token);
  }

  @Post('activation/complete')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation(swagger.auth.activationComplete)
  @ApiBody({ type: ActivationCompleteDto })
  @ApiInvalidData()
  @ApiOkResponse({ type: AuthTokensResponseDto })
  completeActivation(@Body() dto: ActivationCompleteDto): Promise<AuthTokensResponseDto> {
    return this.activationService.complete(dto);
  }

  // ---------------------------------------------------------------- US-00-02 password reset

  @Post('password-reset/request')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation(swagger.auth.passwordResetRequest)
  @ApiBody({ type: PasswordResetRequestDto })
  @ApiInvalidData()
  @ApiOkResponse({ type: SuccessResponseDto })
  async requestPasswordReset(@Body() dto: PasswordResetRequestDto): Promise<SuccessResponseDto> {
    // Always 200: the outcome must not reveal whether the e-mail exists
    await this.passwordResetService.request(dto.email);
    return { success: true };
  }

  @Post('password-reset/validate')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation(swagger.auth.passwordResetValidate)
  @ApiBody({ type: TokenDto })
  @ApiInvalidData()
  @ApiOkResponse({ type: TokenValidResponseDto })
  async validatePasswordReset(@Body() dto: TokenDto): Promise<TokenValidResponseDto> {
    await this.passwordResetService.validate(dto.token);
    return { valid: true };
  }

  @Post('password-reset/complete')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation(swagger.auth.passwordResetComplete)
  @ApiBody({ type: PasswordResetCompleteDto })
  @ApiInvalidData()
  @ApiOkResponse({ type: SuccessResponseDto })
  async completePasswordReset(@Body() dto: PasswordResetCompleteDto): Promise<SuccessResponseDto> {
    await this.passwordResetService.complete(dto.token, dto.password);
    return { success: true };
  }

  // ---------------------------------------------------------------- US-00-02 e-mail change

  @Post('email-change/request')
  @ApiAuthResponses()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(SWAGGER_BEARER_AUTH)
  @HttpCode(HttpStatus.OK)
  @ApiOperation(swagger.auth.emailChangeRequest)
  @ApiBody({ type: EmailChangeRequestDto })
  @ApiInvalidData()
  @ApiOkResponse({ type: SuccessResponseDto })
  async requestEmailChange(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: EmailChangeRequestDto,
  ): Promise<SuccessResponseDto> {
    await this.emailChangeService.request(user.id, dto);
    return { success: true };
  }

  @Post('email-change/confirm')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation(swagger.auth.emailChangeConfirm)
  @ApiBody({ type: TokenDto })
  @ApiInvalidData()
  @ApiOkResponse({ type: EmailChangeConfirmResponseDto })
  confirmEmailChange(@Body() dto: TokenDto): Promise<EmailChangeConfirmResponseDto> {
    return this.emailChangeService.confirm(dto.token);
  }
}
