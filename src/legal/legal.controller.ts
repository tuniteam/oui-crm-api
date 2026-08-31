import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guards';
import { AuthenticatedUser } from '@/auth/interfaces/authenticated-user.interface';
import { SWAGGER_BEARER_AUTH } from '@/common/constants/app.constants';
import { ApiMessages } from '@/common/messages';
import { LegalAcceptDto, LegalAcceptResponseDto } from './dto/legal-accept.dto';
import { LegalService } from './legal.service';

const swagger = ApiMessages.swagger;

/**
 * The documents themselves are served by activation/validate (public page) and /profile/me
 * (re-acceptance gate) — no dedicated versions route (KISS).
 */
@ApiTags(swagger.legal.tag)
@Controller('legal')
export class LegalController {
  constructor(private readonly legalService: LegalService) {}

  @Post('accept')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(SWAGGER_BEARER_AUTH)
  @HttpCode(HttpStatus.OK)
  @ApiOperation(swagger.legal.accept)
  @ApiBody({ type: LegalAcceptDto })
  @ApiOkResponse({ type: LegalAcceptResponseDto })
  accept(@CurrentUser() user: AuthenticatedUser, @Body() dto: LegalAcceptDto): Promise<LegalAcceptResponseDto> {
    return this.legalService.accept(user.id, dto);
  }
}
