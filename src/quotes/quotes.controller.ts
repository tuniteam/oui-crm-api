import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
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
import { QuotesService } from './quotes.service';
import {
  CreateQuoteDto,
  QuoteDetailDto,
  QuoteIdResponseDto,
  QuoteListQueryDto,
  QuoteResultDto,
  QuotesListResponseDto,
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
