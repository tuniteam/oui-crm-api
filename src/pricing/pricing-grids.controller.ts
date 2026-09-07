import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
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
import { ApiAuthResponses, ApiCuidParam, ApiDeleteResponse, ApiGetResponse, ApiListResponse, ApiPatchResponse, ApiPostResponse } from '@/common/decorators';
import { ApiMessages } from '@/common/messages';
import { PaginationQueryDto } from '@/common/dto/pagination.dto';
import { ParseCuidPipe } from '@/common/pipes';
import { PricingGridsService } from './pricing-grids.service';
import {
  ActivatePricingGridDto,
  CreatePricingGridDto,
  PricingGridDetailDto,
  PricingGridIdResponseDto,
  PricingGridsListResponseDto,
  UpdatePricingGridDto,
} from './dto/pricing-grid.dto';

const swagger = ApiMessages.swagger;

/** US-02-01 — versioned pricing grid: prepare a version, then activate it. */
@ApiTags(swagger.pricingGrids.tag)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@ApiAuthResponses()
@UseGuards(JwtAuthGuard, ProjectGuard, PermissionsGuard)
@ProjectScoped()
@ApiHeader({ name: PROJECT_ID_HEADER, description: swagger.projectIdHeaderDesc, required: true })
@Controller('pricing-grids')
export class PricingGridsController {
  constructor(private readonly pricingGridsService: PricingGridsService) {}

  @Get()
  @Permissions({ code: 'pricing:read' })
  @ApiOperation(swagger.pricingGrids.list)
  @ApiListResponse(PricingGridsListResponseDto)
  findAll(
    @CurrentProjectId() projectId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<PricingGridsListResponseDto> {
    return this.pricingGridsService.findAll(projectId, query);
  }

  @Get('active')
  @Permissions({ code: 'pricing:read' })
  @ApiOperation(swagger.pricingGrids.active)
  @ApiGetResponse(PricingGridDetailDto)
  findActive(@CurrentProjectId() projectId: string): Promise<PricingGridDetailDto> {
    return this.pricingGridsService.findActive(projectId);
  }

  @Get(':id')
  @Permissions({ code: 'pricing:read' })
  @ApiOperation(swagger.pricingGrids.get)
  @ApiCuidParam('id', swagger.params.pricingGridId)
  @ApiGetResponse(PricingGridDetailDto)
  findOne(@Param('id', ParseCuidPipe) id: string, @CurrentProjectId() projectId: string): Promise<PricingGridDetailDto> {
    return this.pricingGridsService.findOne(id, projectId);
  }

  @Post()
  @Permissions({ code: 'pricing:update' })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation(swagger.pricingGrids.create)
  @ApiPostResponse(PricingGridIdResponseDto)
  create(
    @CurrentProjectId() projectId: string,
    @Body() dto: CreatePricingGridDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PricingGridIdResponseDto> {
    return this.pricingGridsService.create(projectId, dto, user);
  }

  @Patch(':id')
  @Permissions({ code: 'pricing:update' })
  @ApiOperation(swagger.pricingGrids.update)
  @ApiCuidParam('id', swagger.params.pricingGridId)
  @ApiBody({ type: UpdatePricingGridDto })
  @ApiGetResponse(PricingGridDetailDto)
  update(
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: UpdatePricingGridDto,
    @CurrentProjectId() projectId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PricingGridDetailDto> {
    return this.pricingGridsService.update(id, projectId, dto, user);
  }

  @Delete(':id')
  @Permissions({ code: 'pricing:update' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation(swagger.pricingGrids.remove)
  @ApiCuidParam('id', swagger.params.pricingGridId)
  @ApiDeleteResponse()
  remove(
    @Param('id', ParseCuidPipe) id: string,
    @CurrentProjectId() projectId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.pricingGridsService.remove(id, projectId, user);
  }

  @Post(':id/activate')
  @Permissions({ code: 'pricing:update' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation(swagger.pricingGrids.activate)
  @ApiCuidParam('id', swagger.params.pricingGridId)
  @ApiPatchResponse(PricingGridDetailDto)
  activate(
    @Param('id', ParseCuidPipe) id: string,
    @CurrentProjectId() projectId: string,
    @Body() dto: ActivatePricingGridDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PricingGridDetailDto> {
    return this.pricingGridsService.activate(id, projectId, dto, user);
  }
}
