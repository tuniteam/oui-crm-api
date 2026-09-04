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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PROJECT_ID_HEADER } from '@/auth/auth.constants';
import { CurrentProjectId } from '@/auth/decorators/current-project.decorator';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import { Permissions } from '@/auth/decorators/permissions.decorator';
import { ProjectScoped } from '@/auth/decorators/project-scoped.decorator';
import { ScopeFilter } from '@/auth/decorators/scope-filter.decorator';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guards';
import { PermissionsGuard } from '@/auth/guards/permissions.guard';
import { ProjectGuard } from '@/auth/guards/project.guard';
import { AuthenticatedUser } from '@/auth/interfaces/authenticated-user.interface';
import { SWAGGER_BEARER_AUTH } from '@/common/constants/app.constants';
import { ApiAuthResponses, ApiCuidParam, ApiDeleteResponse, ApiGetResponse, ApiListResponse, ApiPatchResponse, ApiPostResponse } from '@/common/decorators';
import { ApiMessages } from '@/common/messages';
import { ParseCuidPipe } from '@/common/pipes';
import { MAX_SIZE_BY_CATEGORY, UPLOAD_FIELD } from '@/files/files.constants';
import { UploadedFileLike } from '@/files/uploaded-file.interface';
import { QuotesService } from './quotes.service';
import {
  CreateQuoteDto,
  QuoteDetailDto,
  QuoteIdResponseDto,
  QuoteListQueryDto,
  QuoteResultDto,
  QuoteStatusResponseDto,
  QuotesListResponseDto,
  RejectQuoteDto,
  SignQuoteDto,
  SignResponseDto,
  SignedReturnResponseDto,
  SimulateQuoteDto,
  UpdateQuoteDto,
} from './dto/quote.dto';

const swagger = ApiMessages.swagger;

/**
 * US-02-02 and US-02-03 — the quote configurator and its draft. A sales rep granted the OWN
 * scope only sees the quotes they own; the geographic scope of the record applies on top.
 */
@ApiTags(swagger.quotes.tag)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@ApiAuthResponses()
@UseGuards(JwtAuthGuard, ProjectGuard, PermissionsGuard)
@ProjectScoped()
@ApiHeader({ name: PROJECT_ID_HEADER, description: swagger.projectIdHeaderDesc, required: true })
@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Post('simulate')
  @Permissions({ code: 'quotes:read' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation(swagger.quotes.simulate)
  @ApiGetResponse(QuoteResultDto)
  simulate(
    @CurrentProjectId() projectId: string,
    @Body() dto: SimulateQuoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<QuoteResultDto> {
    return this.quotesService.simulate(projectId, dto, user);
  }

  @Get()
  @Permissions({ code: 'quotes:read' })
  @ApiOperation(swagger.quotes.list)
  @ApiListResponse(QuotesListResponseDto)
  findAll(
    @CurrentProjectId() projectId: string,
    @Query() query: QuoteListQueryDto,
    @ScopeFilter('quotes:read') scopeWhere: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<QuotesListResponseDto> {
    return this.quotesService.findAll(projectId, query, scopeWhere, user);
  }

  @Get(':id')
  @Permissions({ code: 'quotes:read' })
  @ApiOperation(swagger.quotes.get)
  @ApiCuidParam('id', swagger.params.quoteId)
  @ApiGetResponse(QuoteDetailDto)
  findOne(
    @Param('id', ParseCuidPipe) id: string,
    @CurrentProjectId() projectId: string,
    @ScopeFilter('quotes:read') scopeWhere: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<QuoteDetailDto> {
    return this.quotesService.findOne(id, projectId, scopeWhere, user);
  }

  @Post()
  @Permissions({ code: 'quotes:create' })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation(swagger.quotes.create)
  @ApiPostResponse(QuoteIdResponseDto)
  create(
    @CurrentProjectId() projectId: string,
    @Body() dto: CreateQuoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<QuoteIdResponseDto> {
    return this.quotesService.create(projectId, dto, user);
  }

  @Patch(':id')
  @Permissions({ code: 'quotes:update' })
  @ApiOperation(swagger.quotes.update)
  @ApiCuidParam('id', swagger.params.quoteId)
  @ApiPatchResponse(QuoteDetailDto)
  update(
    @Param('id', ParseCuidPipe) id: string,
    @CurrentProjectId() projectId: string,
    @Body() dto: UpdateQuoteDto,
    @ScopeFilter('quotes:update') scopeWhere: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<QuoteDetailDto> {
    return this.quotesService.update(id, projectId, dto, scopeWhere, user);
  }


  // ------------------------------------------------------------------ cycle de vie (US-02-04 à 06)

  @Post(':id/submit')
  @Permissions({ code: 'quotes:submit' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation(swagger.quotes.submit)
  @ApiCuidParam('id', swagger.params.quoteId)
  @ApiPatchResponse(QuoteStatusResponseDto)
  submit(
    @Param('id', ParseCuidPipe) id: string,
    @CurrentProjectId() projectId: string,
    @ScopeFilter('quotes:submit') scopeWhere: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<QuoteStatusResponseDto> {
    return this.quotesService.submit(id, projectId, scopeWhere, user);
  }

  @Post(':id/validate')
  @Permissions({ code: 'quotes:validate' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation(swagger.quotes.validate)
  @ApiCuidParam('id', swagger.params.quoteId)
  @ApiPatchResponse(QuoteStatusResponseDto)
  validate(
    @Param('id', ParseCuidPipe) id: string,
    @CurrentProjectId() projectId: string,
    @ScopeFilter('quotes:validate') scopeWhere: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<QuoteStatusResponseDto> {
    return this.quotesService.validate(id, projectId, scopeWhere, user);
  }

  @Post(':id/reject')
  @Permissions({ code: 'quotes:validate' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation(swagger.quotes.reject)
  @ApiCuidParam('id', swagger.params.quoteId)
  @ApiPatchResponse(QuoteStatusResponseDto)
  reject(
    @Param('id', ParseCuidPipe) id: string,
    @CurrentProjectId() projectId: string,
    @Body() dto: RejectQuoteDto,
    @ScopeFilter('quotes:validate') scopeWhere: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<QuoteStatusResponseDto> {
    return this.quotesService.reject(id, projectId, dto, scopeWhere, user);
  }

  @Post(':id/follow-up')
  @Permissions({ code: 'quotes:update' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation(swagger.quotes.followUp)
  @ApiCuidParam('id', swagger.params.quoteId)
  @ApiPatchResponse(QuoteStatusResponseDto)
  followUp(
    @Param('id', ParseCuidPipe) id: string,
    @CurrentProjectId() projectId: string,
    @ScopeFilter('quotes:update') scopeWhere: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<QuoteStatusResponseDto> {
    return this.quotesService.followUp(id, projectId, scopeWhere, user);
  }

  @Post(':id/negotiate')
  @Permissions({ code: 'quotes:update' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation(swagger.quotes.negotiate)
  @ApiCuidParam('id', swagger.params.quoteId)
  @ApiPatchResponse(QuoteStatusResponseDto)
  negotiate(
    @Param('id', ParseCuidPipe) id: string,
    @CurrentProjectId() projectId: string,
    @ScopeFilter('quotes:update') scopeWhere: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<QuoteStatusResponseDto> {
    return this.quotesService.negotiate(id, projectId, scopeWhere, user);
  }

  @Post(':id/decline')
  @Permissions({ code: 'quotes:update' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation(swagger.quotes.decline)
  @ApiCuidParam('id', swagger.params.quoteId)
  @ApiPatchResponse(QuoteStatusResponseDto)
  decline(
    @Param('id', ParseCuidPipe) id: string,
    @CurrentProjectId() projectId: string,
    @Body() dto: RejectQuoteDto,
    @ScopeFilter('quotes:update') scopeWhere: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<QuoteStatusResponseDto> {
    return this.quotesService.decline(id, projectId, dto, scopeWhere, user);
  }

  @Post(':id/reopen')
  @Permissions({ code: 'quotes:create' })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation(swagger.quotes.reopen)
  @ApiCuidParam('id', swagger.params.quoteId)
  @ApiPostResponse(QuoteIdResponseDto)
  reopen(
    @Param('id', ParseCuidPipe) id: string,
    @CurrentProjectId() projectId: string,
    @ScopeFilter('quotes:create') scopeWhere: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<QuoteIdResponseDto> {
    return this.quotesService.reopen(id, projectId, scopeWhere, user);
  }

  @Post(':id/sign')
  @Permissions({ code: 'quotes:sign' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation(swagger.quotes.sign)
  @ApiCuidParam('id', swagger.params.quoteId)
  @ApiPatchResponse(SignResponseDto)
  sign(
    @Param('id', ParseCuidPipe) id: string,
    @CurrentProjectId() projectId: string,
    @Body() dto: SignQuoteDto,
    @ScopeFilter('quotes:sign') scopeWhere: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SignResponseDto> {
    return this.quotesService.sign(id, projectId, dto, scopeWhere, user);
  }

  @Post(':id/signed-return')
  @Permissions({ code: 'quotes:update' })
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor(UPLOAD_FIELD, { limits: { fileSize: MAX_SIZE_BY_CATEGORY.SIGNED_RETURN } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation(swagger.quotes.signedReturn)
  @ApiCuidParam('id', swagger.params.quoteId)
  @ApiPostResponse(SignedReturnResponseDto)
  signedReturn(
    @Param('id', ParseCuidPipe) id: string,
    @CurrentProjectId() projectId: string,
    @UploadedFile() file: UploadedFileLike | undefined,
    @ScopeFilter('quotes:update') scopeWhere: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SignedReturnResponseDto> {
    return this.quotesService.signedReturn(id, projectId, file, scopeWhere, user);
  }

  @Delete(':id')
  @Permissions({ code: 'quotes:delete' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation(swagger.quotes.delete)
  @ApiCuidParam('id', swagger.params.quoteId)
  @ApiDeleteResponse()
  remove(
    @Param('id', ParseCuidPipe) id: string,
    @CurrentProjectId() projectId: string,
    @ScopeFilter('quotes:delete') scopeWhere: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.quotesService.remove(id, projectId, scopeWhere, user);
  }
}
