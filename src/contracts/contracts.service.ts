import { Injectable } from '@nestjs/common';
import { ContractStatus, Prisma } from '@prisma/client';
import { AuditLogService } from '@/audit-log/audit-log.service';
import { AUDIT_OBJECTS } from '@/audit-log/audit-log.constants';
import { AuthenticatedUser } from '@/auth/interfaces/authenticated-user.interface';
import { apiError } from '@/common/api-error';
import { buildPaginationMeta, paginationSkip } from '@/common/dto/pagination.dto';
import { formatDateField } from '@/common/utils/date.utils';
import { PrismaService } from '@/prisma/prisma.service';
import { QuoteConfig } from '@/pricing/pricing.types';
import { QuotesService } from '@/quotes/quotes.service';
import { ScopeService } from '@/scopes/scope.service';
import { loadScopeContext, mergeVisibilityWhere } from '@/scopes/scopes.utils';
import { AMENDMENT_QUOTE_TYPES, CONTRACTS_AUDIT } from './contracts.constants';
import {
  amendmentConfig,
  amendmentStartDate,
  applyContractStatus,
  assertAmendable,
} from './contracts.utils';
import {
  AmendContractDto,
  AmendResponseDto,
  ContractDto,
  ContractListQueryDto,
  ContractsListResponseDto,
} from './dto/contract.dto';

const CONTRACT_INCLUDE = {
  organization: { select: { id: true, name: true, population: true } },
  quote: { select: { number: true } },
} satisfies Prisma.ContractInclude;

type ContractRow = Prisma.ContractGetPayload<{ include: typeof CONTRACT_INCLUDE }>;

/**
 * US-02-07 / US-02-10 — les contrats. Le L2 les **crée** à la signature (SPEC-14 D1) et les
 * expose en lecture ; la seule écriture offerte est l'ouverture d'un avenant (D16), qui ne
 * touche au contrat que par son statut.
 */
@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly quotes: QuotesService,
    private readonly scopeService: ScopeService,
  ) {}

  async findAll(
    projectId: string,
    query: ContractListQueryDto,
    scopeWhere: Record<string, unknown>,
    user: AuthenticatedUser,
  ): Promise<ContractsListResponseDto> {
    const where: Prisma.ContractWhereInput = {
      projectId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.organizationId ? { organizationId: query.organizationId } : {}),
      // Portée de `contracts:read` : OWN pour un commercial, d'où `ownerId` sur le contrat.
      ...scopeWhere,
      // Et par-dessus, le périmètre géographique de la fiche qu'il engage (L1).
      organization: await this.visibleOrganizations(user, projectId),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.contract.findMany({
        where,
        include: CONTRACT_INCLUDE,
        orderBy: [{ signedAt: 'desc' }, { number: 'desc' }],
        skip: paginationSkip(query.page, query.limit),
        take: query.limit,
      }),
      this.prisma.contract.count({ where }),
    ]);

    return { data: rows.map((row) => this.toDto(row)), meta: buildPaginationMeta(total, query.page, query.limit) };
  }

  async findOne(
    id: string,
    projectId: string,
    scopeWhere: Record<string, unknown>,
    user: AuthenticatedUser,
  ): Promise<ContractDto> {
    return this.toDto(await this.loadVisible(id, projectId, scopeWhere, user));
  }

  /**
   * US-02-10 — ouvrir un avenant. Un renouvellement n'est pas un type de devis à part : c'est
   * **une affaire de plus**, qui repart du cycle normal (SPEC-14 D16). Un seul appel pose donc
   * les trois pièces : le contrat passe `AMENDING`, l'opportunité s'ouvre (ou se réutilise) et
   * le devis naît pré-rempli depuis la configuration signée.
   *
   * Le contrat reste facturé jusqu'à la date de début de son successeur : c'est le job
   * `contracts.close` qui le clôt ce jour-là, pas cette route.
   */
  async amend(
    id: string,
    projectId: string,
    dto: AmendContractDto,
    user: AuthenticatedUser,
  ): Promise<AmendResponseDto> {
    if (!AMENDMENT_QUOTE_TYPES.includes(dto.type)) throw apiError.badRequest('INVALID_DATA');

    // Pas de filtre de propriété ici : le contrat se voit par sa fiche, et c'est l'accès complet
    // à cette fiche — exigé plus bas par la création du devis — qui autorise l'avenant.
    const contract = await this.loadVisible(id, projectId, {}, user);
    assertAmendable(contract);

    const signed = await this.prisma.quote.findUnique({
      where: { id: contract.quoteId },
      select: { config: true },
    });
    // Un devis repris du classeur n'a pas de configuration à rejouer (SPEC-05 §2.2).
    if (!signed?.config) throw apiError.conflict('QUOTE_HAS_NO_CONFIG');

    const config = amendmentConfig(signed.config as unknown as QuoteConfig, dto.type);
    const quote = await this.quotes.createAmendmentDraft(projectId, user, {
      organizationId: contract.organizationId,
      type: dto.type,
      config,
      startDate: amendmentStartDate(contract, dto.type),
      sourceContractId: contract.id,
      sourceQuoteId: contract.quoteId,
      onCreated: async (tx) => {
        const moved = await applyContractStatus(tx, projectId, contract, ContractStatus.AMENDING);
        await this.audit.log(tx, {
          projectId,
          userId: user.id,
          action: CONTRACTS_AUDIT.AMEND,
          objectType: AUDIT_OBJECTS.CONTRACT,
          objectId: contract.id,
          metadata: { number: contract.number, type: dto.type, ...moved },
        });
      },
    });

    return {
      contractStatus: ContractStatus.AMENDING,
      opportunityId: quote.opportunityId,
      quoteId: quote.id,
      quoteNumber: quote.number,
    };
  }

  /** Fragment de visibilité des fiches, comme dans les autres services du lot. */
  private async visibleOrganizations(
    user: AuthenticatedUser,
    projectId: string,
  ): Promise<Prisma.OrganizationWhereInput> {
    const ctx = await loadScopeContext(this.prisma, user, projectId);
    const where: Prisma.OrganizationWhereInput = { deletedAt: null };
    mergeVisibilityWhere(where, ctx, this.scopeService);
    return where;
  }

  private async loadVisible(
    id: string,
    projectId: string,
    scopeWhere: Record<string, unknown>,
    user: AuthenticatedUser,
  ): Promise<ContractRow> {
    const contract = await this.prisma.contract.findFirst({
      where: {
        id,
        projectId,
        ...scopeWhere,
        organization: await this.visibleOrganizations(user, projectId),
      },
      include: CONTRACT_INCLUDE,
    });
    if (!contract) throw apiError.notFound('CONTRACT_NOT_FOUND', id);
    return contract;
  }

  private toDto(row: ContractRow): ContractDto {
    return {
      id: row.id,
      number: row.number,
      status: row.status,
      organization: row.organization,
      quoteId: row.quoteId,
      quoteNumber: row.quote.number,
      signedAt: formatDateField(row.signedAt),
      startDate: formatDateField(row.startDate),
      endDate: formatDateField(row.endDate),
      commitmentMonths: row.commitmentMonths,
      noticeMonths: row.noticeMonths,
      autoRenew: row.autoRenew,
      billing: row.billing,
      plan: row.plan,
      trialClause: row.trialClause,
      mrrList: row.mrrList.toString(),
      mrrNet: row.mrrNet.toString(),
      arrList: row.arrList.toString(),
      arrNet: row.arrNet.toString(),
      oneShotTotal: row.oneShotTotal.toString(),
      sourceContractId: row.sourceContractId,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
