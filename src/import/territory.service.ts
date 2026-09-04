import { Injectable, Logger } from '@nestjs/common';
import { Prisma, SalesStatus } from '@prisma/client';
import { AuthenticatedUser } from '@/auth/interfaces/authenticated-user.interface';
import { AuditLogService } from '@/audit-log/audit-log.service';
import { AUDIT_OBJECTS } from '@/audit-log/audit-log.constants';
import { apiError } from '@/common/api-error';
import { PrismaService } from '@/prisma/prisma.service';
import {
  assertAssigneesAreMembers,
  assertReferencesKnown,
  completenessScore,
  recomputeCompleteness,
} from '@/organizations/organizations.utils';
import { IMPORT_AUDIT, TERRITORY, stampAppliedAt } from './import.constants';
import { TerritoryImportDto, TerritoryReportDto } from './dto/territory.dto';
import {
  GeoCommune,
  KNOWN_DEPARTMENTS,
  TerritoryPlanItem,
  dedupeByInsee,
  departmentOfInsee,
  filterByPopulation,
  planTerritory,
} from './territory.utils';

/** Transaction budget for a full-department import (a few thousand rows at most). */
const APPLY_TIMEOUT_MS = 30_000;

/**
 * US-01-14 — create every commune of a territory in one call, without a file to prepare.
 * Same mechanics as the file import: dryRun first, a report, a cancellable batch. Matching is
 * on the INSEE code, never the name; nothing existing is overwritten (population excepted,
 * behind updatePopulation). The SIRET is not in this source: it stays empty, completed record
 * by record through search-registry (US-01-02).
 */
@Injectable()
export class TerritoryService {
  private readonly logger = new Logger(TerritoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async import(
    projectId: string,
    dto: TerritoryImportDto,
    dryRun: boolean,
    user: AuthenticatedUser,
  ): Promise<TerritoryReportDto> {
    await this.validate(projectId, dto);

    const requested = dedupeByInsee(
      filterByPopulation(await this.fetchCommunes(dto), dto.minPopulation, dto.maxPopulation),
    );
    if (requested.length > TERRITORY.MAX_ROWS) {
      throw apiError.payloadTooLarge('IMPORT_TOO_MANY_ROWS', TERRITORY.MAX_ROWS);
    }

    const existing = await this.prisma.organization.findMany({
      where: { projectId, deletedAt: null, inseeCode: { in: requested.map((c) => c.code) } },
      select: { id: true, inseeCode: true, population: true },
    });
    const populationByInsee = new Map(existing.map((o) => [o.inseeCode as string, o.population]));
    const idByInsee = new Map(existing.map((o) => [o.inseeCode as string, o.id]));

    const items = planTerritory(requested, populationByInsee, dto.updatePopulation === true);
    const totals = {
      created: items.filter((i) => i.status === 'CREATED').length,
      updated: items.filter((i) => i.status === 'UPDATED').length,
      skipped: items.filter((i) => i.status === 'SKIPPED').length,
      errors: 0,
    };

    if (dryRun) return { dryRun: true, ok: true, totals, items };

    const communeByInsee = new Map(requested.map((c) => [c.code, c]));
    const batchId = await this.apply(projectId, dto, items, communeByInsee, idByInsee, user, totals);
    return { dryRun: false, ok: true, batchId, totals, items };
  }

  // ------------------------------------------------------------------------------ validation

  private async validate(projectId: string, dto: TerritoryImportDto): Promise<void> {
    if (!dto.departments?.length && !dto.epciCodes?.length) throw apiError.badRequest('INVALID_DATA');
    if (dto.departments?.some((d) => !KNOWN_DEPARTMENTS.has(d))) throw apiError.badRequest('INVALID_DATA');
    if (dto.minPopulation !== undefined && dto.maxPopulation !== undefined && dto.minPopulation > dto.maxPopulation) {
      throw apiError.badRequest('INVALID_DATA');
    }
    // Every created record is a commune (D5): the structure type must exist in the referential
    await assertReferencesKnown(this.prisma, projectId, { type: TERRITORY.STRUCTURE_TYPE });
    if (dto.salesRepId) await assertAssigneesAreMembers(this.prisma, projectId, { salesRepId: dto.salesRepId });
    if (dto.campaignId) {
      const campaign = await this.prisma.campaign.findFirst({
        where: { id: dto.campaignId, projectId },
        select: { id: true },
      });
      if (!campaign) throw apiError.notFound('CAMPAIGN_NOT_FOUND', dto.campaignId);
    }
  }

  // ------------------------------------------------------------------------------ geo source

  private async fetchCommunes(dto: TerritoryImportDto): Promise<GeoCommune[]> {
    const urls = [
      ...(dto.departments ?? []).map((d) => `${TERRITORY.GEO_API_URL}/departements/${d}/communes`),
      ...(dto.epciCodes ?? []).map((e) => `${TERRITORY.GEO_API_URL}/epcis/${e}/communes`),
    ];
    const out: GeoCommune[] = [];
    for (const url of urls) out.push(...(await this.fetchOrDegrade(`${url}?fields=${TERRITORY.COMMUNE_FIELDS}`)));
    return out;
  }

  /** An outage or timeout of the open source is degraded mode: nothing is written. */
  private async fetchOrDegrade(url: string): Promise<GeoCommune[]> {
    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(TERRITORY.TIMEOUT_MS) });
    } catch {
      this.logger.warn(`Territory source unreachable: ${url}`);
      throw apiError.serviceUnavailable('TERRITORY_SOURCE_UNAVAILABLE');
    }
    // The source answers 404 for a code it does not know: user input, not an outage
    if (response.status === 404) throw apiError.badRequest('INVALID_DATA');
    if (!response.ok) {
      this.logger.warn(`Territory source answered ${response.status}: ${url}`);
      throw apiError.serviceUnavailable('TERRITORY_SOURCE_UNAVAILABLE');
    }
    return (await response.json()) as GeoCommune[];
  }

  // ------------------------------------------------------------------------------ apply

  private async apply(
    projectId: string,
    dto: TerritoryImportDto,
    items: TerritoryPlanItem[],
    communeByInsee: ReadonlyMap<string, GeoCommune>,
    idByInsee: ReadonlyMap<string, string>,
    user: AuthenticatedUser,
    totals: TerritoryReportDto['totals'],
  ): Promise<string> {
    const prefix = await this.communePrefix(projectId);

    return this.prisma.$transaction(
      async (tx) => {
        const batch = await tx.importBatch.create({
          data: { projectId, profile: 'TERRITORY', status: 'APPLIED', totals: { ...totals }, createdBy: user.id },
          select: { id: true },
        });

        const created = await tx.organization.createManyAndReturn({
          data: items
            .filter((i) => i.status === 'CREATED')
            .map((i) => this.toOrganization(projectId, batch.id, communeByInsee.get(i.inseeCode)!, prefix, dto)),
          select: { id: true },
        });

        if (dto.campaignId && created.length) {
          await tx.campaignOrganization.createMany({
            data: created.map((o) => ({ campaignId: dto.campaignId!, organizationId: o.id, addedBy: user.id })),
            skipDuplicates: true,
          });
        }

        // The census refresh is the only write on existing records (D6) — score follows population
        for (const item of items.filter((i) => i.status === 'UPDATED')) {
          const id = idByInsee.get(item.inseeCode)!;
          await tx.organization.update({ where: { id }, data: { population: item.population } });
          await recomputeCompleteness(tx, id);
        }

        // Même règle que l'import de fichier : l'instant de référence est posé une fois les
        // fiches écrites, dans la même transaction.
        await tx.importBatch.update({
          where: { id: batch.id },
          data: { totals: stampAppliedAt({ ...totals }) },
        });

        await this.audit.log(tx, {
          projectId,
          userId: user.id,
          action: IMPORT_AUDIT.RUN,
          objectType: AUDIT_OBJECTS.IMPORT_BATCH,
          objectId: batch.id,
          metadata: {
            profile: 'TERRITORY',
            departments: dto.departments ?? [],
            epciCodes: dto.epciCodes ?? [],
            ...totals,
          },
        });
        return batch.id;
      },
      { timeout: APPLY_TIMEOUT_MS },
    );
  }

  private toOrganization(
    projectId: string,
    importBatchId: string,
    commune: GeoCommune,
    displayPrefix: string | null,
    dto: TerritoryImportDto,
  ): Prisma.OrganizationCreateManyInput {
    const population = commune.population ?? null;
    const postalCode = commune.codesPostaux?.[0] ?? null;
    return {
      projectId,
      importBatchId,
      name: commune.nom,
      type: TERRITORY.STRUCTURE_TYPE,
      displayPrefix,
      inseeCode: commune.code,
      department: departmentOfInsee(commune.code),
      city: commune.nom,
      postalCode,
      population,
      epci: commune.codeEpci ?? null,
      salesRepId: dto.salesRepId ?? null,
      // Targeted at creation: the record starts TO_CONTACT — a state, not a transition to journal
      salesStatus: dto.campaignId ? SalesStatus.TO_CONTACT : SalesStatus.NOT_CONTACTED,
      completenessScore: completenessScore({
        siret: null,
        address: null,
        postalCode,
        population,
        email: null,
        hasPrimaryContact: false,
      }),
    };
  }

  /** `displayPrefix` comes from the STRUCTURE_TYPE referential ("Commune de "), when configured. */
  private async communePrefix(projectId: string): Promise<string | null> {
    const item = await this.prisma.referenceItem.findFirst({
      where: { projectId, category: 'STRUCTURE_TYPE', key: TERRITORY.STRUCTURE_TYPE, active: true },
      select: { metadata: true },
    });
    const prefix = (item?.metadata as { prefix?: unknown } | null)?.prefix;
    return typeof prefix === 'string' && prefix.trim() ? prefix : null;
  }
}
