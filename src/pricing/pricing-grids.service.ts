// ============================================
// OUI-CRM - Pricing grid versions (US-02-01)
// ============================================

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AUDIT_OBJECTS } from '@/audit-log/audit-log.constants';
import { UserWithInitials, loadUsersWithInitials } from '@/audit-log/audit-log-labels';
import { AuditLogService } from '@/audit-log/audit-log.service';
import { AuthenticatedUser } from '@/auth/interfaces/authenticated-user.interface';
import { apiError, withDetails } from '@/common/api-error';
import { PaginationQueryDto, buildPaginationMeta, paginationSkip } from '@/common/dto/pagination.dto';
import { formatDateField, parseDayOrThrow } from '@/common/utils/date.utils';
import { userRef } from '@/common/utils/user.utils';
import { PrismaService } from '@/prisma/prisma.service';
import { recomputeDraftQuotes } from '@/quotes/quotes.utils';
import { PRICING_AUDIT } from './pricing.constants';
import { PricingService } from './pricing.service';
import { PricingGridContent } from './pricing.types';
import { assertBaseUpToDate, validateGridContent } from './pricing.utils';
import {
  ActivatePricingGridDto,
  CreatePricingGridDto,
  PricingGridDetailDto,
  PricingGridIdResponseDto,
  PricingGridListItemDto,
  PricingGridsListResponseDto,
} from './dto/pricing-grid.dto';

type GridRow = {
  id: string;
  version: number;
  effectiveDate: Date;
  active: boolean;
  basedOnVersion: number | null;
  createdById: string | null;
  createdAt: Date;
};

@Injectable()
export class PricingGridsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly audit: AuditLogService,
  ) {}

  // -------------------------------------------------------------------------------- read

  async findAll(projectId: string, query: PaginationQueryDto): Promise<PricingGridsListResponseDto> {
    const { page, limit } = query;
    const where: Prisma.PricingGridWhereInput = { projectId };
    const [total, rows] = await Promise.all([
      this.prisma.pricingGrid.count({ where }),
      this.prisma.pricingGrid.findMany({
        where,
        skip: paginationSkip(page, limit),
        take: limit,
        orderBy: { version: 'desc' },
        select: {
          id: true,
          version: true,
          effectiveDate: true,
          active: true,
          basedOnVersion: true,
          createdById: true,
          createdAt: true,
          _count: { select: { quotes: true } },
        },
      }),
    ]);

    const authors = await loadUsersWithInitials(
      this.prisma,
      projectId,
      [...new Set(rows.map((r) => r.createdById).filter((id): id is string => !!id))],
    );

    return {
      data: rows.map((row) => this.mapToListItem(row, authors.get(row.createdById ?? ''), row._count.quotes)),
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  /** Grille servant les brouillons et les simulations. */
  async findActive(projectId: string): Promise<PricingGridDetailDto> {
    const grid = await this.prisma.pricingGrid.findFirst({ where: { projectId, active: true } });
    if (!grid) throw apiError.notFound('PRICING_GRID_NO_ACTIVE');
    return this.toDetail(projectId, grid, grid.content);
  }

  async findOne(id: string, projectId: string): Promise<PricingGridDetailDto> {
    const grid = await this.getOrThrow(id, projectId);
    return this.toDetail(projectId, grid, grid.content);
  }

  // -------------------------------------------------------------------------------- write

  /**
   * Nouvelle version : le numéro suit la dernière du projet, jamais fourni par le client.
   * Elle est créée **inactive** — l'activation est un geste séparé (`POST /:id/activate`),
   * pour qu'une grille se prépare sans changer les prix servis aux commerciaux.
   */
  async create(projectId: string, dto: CreatePricingGridDto, user: AuthenticatedUser): Promise<PricingGridIdResponseDto> {
    const effectiveDate = parseDayOrThrow(dto.effectiveDate);
    const content = await this.resolveContent(projectId, dto);
    const identicalToBase = await this.isIdenticalToBase(projectId, dto, content);

    const issues = validateGridContent(content);
    if (issues.length) throw withDetails(apiError.badRequest('PRICING_GRID_INVALID', issues.join('; ')), issues);

    const grid = await this.prisma.$transaction(async (tx) => {
      // Le numéro suit la dernière version DU PROJET, lu dans la transaction : deux
      // préparations simultanées ne peuvent pas viser le même numéro sans que l'unicité
      // (projectId, version) ne tranche.
      const last = await tx.pricingGrid.findFirst({
        where: { projectId },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const version = (last?.version ?? 0) + 1;

      const created = await tx.pricingGrid.create({
        data: {
          projectId,
          version,
          effectiveDate,
          active: false,
          content: content as Prisma.InputJsonValue,
          // Déclarée par le client, jamais devinée (D21) : le serveur ne reçoit qu'un contenu.
          basedOnVersion: dto.fromVersion ?? null,
          createdById: user.id,
        },
        select: { id: true, version: true },
      });
      await this.audit.log(tx, {
        projectId,
        userId: user.id,
        action: PRICING_AUDIT.GRID_CREATE,
        objectType: AUDIT_OBJECTS.PRICING_GRID,
        objectId: created.id,
        metadata: {
          version,
          effectiveDate: dto.effectiveDate,
          basedOnVersion: dto.fromVersion ?? null,
          // Une copie conforme se distingue d'une copie corrigée : utile en relecture, gratuit ici.
          identicalToBase: identicalToBase ?? null,
        },
      });
      return created;
    });

    return grid;
  }

  /**
   * Bascule la version active. Une seule l'est à la fois, dans une transaction : un
   * commercial ne peut pas tomber sur un instant où le projet n'a plus de grille.
   *
   * Les devis déjà soumis portent leur propre `pricingGridId` et ne bougent pas ; les
   * brouillons sont recalculés à la lecture depuis la grille active, donc suivent d'eux-mêmes.
   */
  async activate(
    id: string,
    projectId: string,
    dto: ActivatePricingGridDto,
    user: AuthenticatedUser,
  ): Promise<PricingGridDetailDto> {
    const grid = await this.getOrThrow(id, projectId);

    const issues = validateGridContent(grid.content);
    if (issues.length) throw withDetails(apiError.badRequest('PRICING_GRID_INVALID', issues.join('; ')), issues);

    if (grid.active) return this.toDetail(projectId, grid, grid.content);

    const previous = await this.prisma.pricingGrid.findFirst({
      where: { projectId, active: true },
      select: { version: true },
    });
    // Le garde-fou de filiation (D21). Une version préparée depuis une grille qui n'est plus
    // active porte des prix périmés : l'activer efface silencieusement tout ce qui a été fait
    // depuis. On refuse, sauf demande explicite — revenir en arrière est un cas légitime.
    assertBaseUpToDate(grid.basedOnVersion, previous?.version ?? null, dto.force === true);

    const settings = await this.prisma.settings.findUnique({
      where: { projectId },
      select: { vatRate: true },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.pricingGrid.updateMany({ where: { projectId, active: true }, data: { active: false } });
      await tx.pricingGrid.update({ where: { id }, data: { active: true } });

      // Les brouillons suivent la nouvelle grille : leur détail était déjà recalculé à la
      // lecture, ce sont leurs montants de liste — ceux qui se trient et se filtrent — qu'on
      // remet d'aplomb ici. Les devis soumis gardent leur version figée.
      const recomputed = await recomputeDraftQuotes(
        tx,
        this.pricing,
        projectId,
        grid.content as unknown as PricingGridContent,
        id,
        Number(settings?.vatRate ?? 0),
      );

      await this.audit.log(tx, {
        projectId,
        userId: user.id,
        action: PRICING_AUDIT.GRID_ACTIVATE,
        objectType: AUDIT_OBJECTS.PRICING_GRID,
        objectId: id,
        metadata: {
          version: grid.version,
          draftsRecomputed: recomputed,
          basedOnVersion: grid.basedOnVersion,
          previousActiveVersion: previous?.version ?? null,
          // Le garde-fou empêche la perte silencieuse ; quand quelqu'un force légitimement, le
          // post-mortem doit pouvoir le relire (D21).
          forced: dto.force === true && grid.basedOnVersion !== null && grid.basedOnVersion !== (previous?.version ?? null),
        },
      });
    });

    return this.findActive(projectId);
  }

  // -------------------------------------------------------------------------------- helpers

  private async getOrThrow(id: string, projectId: string) {
    const grid = await this.prisma.pricingGrid.findFirst({ where: { id, projectId } });
    if (!grid) throw apiError.notFound('PRICING_GRID_NOT_FOUND', id);
    return grid;
  }

  /** `content` fourni, sinon copie de `fromVersion` ; l'un des deux est obligatoire. */
  private async resolveContent(projectId: string, dto: CreatePricingGridDto): Promise<unknown> {
    if (dto.content) return dto.content;
    if (dto.fromVersion === undefined) throw apiError.badRequest('PRICING_GRID_CONTENT_REQUIRED');
    const source = await this.prisma.pricingGrid.findFirst({
      where: { projectId, version: dto.fromVersion },
      select: { content: true },
    });
    if (!source) throw apiError.notFound('PRICING_GRID_VERSION_NOT_FOUND', String(dto.fromVersion));
    return source.content;
  }

  /**
   * Le contenu envoyé est-il **identique** à celui de la version déclarée ? `null` quand la
   * question ne se pose pas — pas de filiation déclarée, ou pas de contenu envoyé (c'est alors
   * une copie par construction).
   */
  private async isIdenticalToBase(
    projectId: string,
    dto: CreatePricingGridDto,
    content: unknown,
  ): Promise<boolean | null> {
    if (dto.fromVersion === undefined) return null;
    if (!dto.content) return true;
    const base = await this.prisma.pricingGrid.findFirst({
      where: { projectId, version: dto.fromVersion },
      select: { content: true },
    });
    return base ? JSON.stringify(base.content) === JSON.stringify(content) : null;
  }

  private mapToListItem(row: GridRow, author: UserWithInitials | undefined, quotesCount: number): PricingGridListItemDto {
    return {
      id: row.id,
      version: row.version,
      effectiveDate: formatDateField(row.effectiveDate),
      active: row.active,
      createdBy: author ? userRef(author, author.id) : null,
      createdAt: row.createdAt.toISOString(),
      quotesCount,
      basedOnVersion: row.basedOnVersion,
    };
  }

  private async toDetail(projectId: string, row: GridRow, content: Prisma.JsonValue): Promise<PricingGridDetailDto> {
    const [authors, quotesCount] = await Promise.all([
      loadUsersWithInitials(this.prisma, projectId, row.createdById ? [row.createdById] : []),
      this.prisma.quote.count({ where: { projectId, pricingGridId: row.id } }),
    ]);
    return {
      ...this.mapToListItem(row, authors.get(row.createdById ?? ''), quotesCount),
      content: content as unknown as PricingGridContent,
    };
  }
}
