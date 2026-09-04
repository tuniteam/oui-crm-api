import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
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
import {
  ApiAuthResponses,
  ApiCuidParam,
  ApiGetResponse,
  ApiListResponse,
  ApiPostResponse,
} from '@/common/decorators';
import { ApiMessages } from '@/common/messages';
import { ParseCuidPipe } from '@/common/pipes';
import { ContractsService } from './contracts.service';
import {
  AmendContractDto,
  AmendResponseDto,
  ContractDto,
  ContractListQueryDto,
  ContractsListResponseDto,
} from './dto/contract.dto';

const swagger = ApiMessages.swagger;

/**
 * US-02-07 / US-02-10 — les contrats. Le L2 les crée à la signature d'un devis et les expose en
 * **lecture** ; la seule écriture est l'ouverture d'un avenant, qui repart du cycle commercial.
 * Le cycle de vie (préavis, résiliation, facturation) appartient au L3.
 */
@ApiTags(swagger.contracts.tag)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@ApiAuthResponses()
@UseGuards(JwtAuthGuard, ProjectGuard, PermissionsGuard)
@ProjectScoped()
@ApiHeader({ name: PROJECT_ID_HEADER, description: swagger.projectIdHeaderDesc, required: true })
@Controller('contracts')
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Get()
  @Permissions({ code: 'contracts:read' })
  @ApiOperation(swagger.contracts.list)
  @ApiListResponse(ContractsListResponseDto)
  findAll(
    @CurrentProjectId() projectId: string,
    @Query() query: ContractListQueryDto,
    @ScopeFilter('contracts:read') scopeWhere: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ContractsListResponseDto> {
    return this.contractsService.findAll(projectId, query, scopeWhere, user);
  }

  @Get(':id')
  @Permissions({ code: 'contracts:read' })
  @ApiOperation(swagger.contracts.detail)
  @ApiCuidParam('id', swagger.params.contractId)
  @ApiGetResponse(ContractDto)
  findOne(
    @Param('id', ParseCuidPipe) id: string,
    @CurrentProjectId() projectId: string,
    @ScopeFilter('contracts:read') scopeWhere: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ContractDto> {
    return this.contractsService.findOne(id, projectId, scopeWhere, user);
  }

  /**
   * Permission `quotes:create`, et non `contracts:update` : ce que cette route produit, c'est un
   * **devis**. Le passage du contrat en `AMENDING` en est la conséquence. Avec `contracts:update`
   * — que le catalogue ne donne qu'à la direction — un commercial n'aurait pas pu renouveler son
   * propre client (constaté à la première fumée, 04/09).
   *
   * La visibilité tient à la fiche : le service exige l'accès **complet** à l'organisme, comme
   * pour n'importe quelle création de devis.
   */
  @Post(':id/amend')
  @Permissions({ code: 'quotes:create' })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation(swagger.contracts.amend)
  @ApiCuidParam('id', swagger.params.contractId)
  @ApiPostResponse(AmendResponseDto)
  amend(
    @Param('id', ParseCuidPipe) id: string,
    @CurrentProjectId() projectId: string,
    @Body() dto: AmendContractDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AmendResponseDto> {
    return this.contractsService.amend(id, projectId, dto, user);
  }
}
