// ============================================
// OUI-CRM - Pricing grid versions (US-02-01)
// ============================================

import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient, QuoteStatus } from '@prisma/client';
import { AUDIT_OBJECTS } from '@/audit-log/audit-log.constants';
import { UserWithInitials, loadUsersWithInitials } from '@/audit-log/audit-log-labels';
import { AuditLogService } from '@/audit-log/audit-log.service';
import { AuthenticatedUser } from '@/auth/interfaces/authenticated-user.interface';
import { apiError, withDetails, withMeta } from '@/common/api-error';
import { PaginationQueryDto, buildPaginationMeta, paginationSkip } from '@/common/dto/pagination.dto';
import { formatDateField, parseDayOrThrow, todayUtc } from '@/common/utils/date.utils';
import { userRef } from '@/common/utils/user.utils';
import { PrismaService } from '@/prisma/prisma.service';
import { recomputeDraftQuotes } from '@/quotes/quotes.utils';
import { PRICING_AUDIT } from './pricing.constants';
import { PricingService } from './pricing.service';
import { PricingGridContent } from './pricing.types';
import {
  assertBaseUpToDate,
  assertEffectiveDateValid,
  assignItemIds,
  countUnidentifiedItems,
  draftsUsingItems,
  isBaseOutdated,
  removedGridItems,
  validateGridContent,
} from './pricing.utils';
import {
  ActivatePricingGridDto,
  CreatePricingGridDto,
  PricingGridActivationDto,
  PricingGridDetailDto,
  PricingGridIdResponseDto,
  PricingGridListItemDto,
  PricingGridsListResponseDto,
  UpdatePricingGridDto,
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

/** Le client Prisma ou une transaction : les gardes se posent dans la transaction. */
type Db = PrismaClient | Prisma.TransactionClient;

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
    const [total, rows, activeVersion] = await Promise.all([
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
      this.activeVersion(projectId),
    ]);

    const authors = await loadUsersWithInitials(
      this.prisma,
      projectId,
      [...new Set(rows.map((r) => r.createdById).filter((id): id is string => !!id))],
    );

    return {
      data: rows.map((row) =>
        this.mapToListItem(row, authors.get(row.createdById ?? ''), row._count.quotes, activeVersion),
      ),
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
    const submitted = await this.resolveContent(projectId, dto);
    this.assertContentValid(submitted);

    const grid = await this.prisma.$transaction(async (tx) => {
      await this.assertEffectiveDate(tx, projectId, effectiveDate);
      // Les identifiants se réservent dans la transaction : deux préparations simultanées ne
      // peuvent pas distribuer le même numéro (SPEC-19 D4).
      const content = await this.withServerItemIds(tx, projectId, submitted);
      const identicalToBase = await this.isIdenticalToBase(projectId, dto, content);

      // Le numéro vient d'un compteur qui ne redescend jamais (SPEC-18 D6) : supprimer une
      // version ne libère pas son numéro, sans quoi le journal désignerait deux objets par
      // « Grille v4 ». L'incrément atomique tranche aussi deux préparations simultanées.
      const { pricingGridSeq: version } = await tx.project.update({
        where: { id: projectId },
        data: { pricingGridSeq: { increment: 1 } },
        select: { pricingGridSeq: true },
      });

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
  /**
   * SPEC-18 §2 — corriger une version au lieu d'en créer une. C'est la cause racine des
   * brouillons morts : sans cette route, chaque correction fabriquait une version de plus.
   *
   * Seuls les devis **émis** retiennent la grille ; les brouillons sont recalculés, comme à
   * l'activation. Corriger la grille active est permis quand aucun devis n'y est attaché —
   * c'est le cas d'un projet neuf dont la v1 porte une coquille — et change alors les prix
   * immédiatement, sans geste d'activation.
   */
  async update(
    id: string,
    projectId: string,
    dto: UpdatePricingGridDto,
    user: AuthenticatedUser,
  ): Promise<PricingGridDetailDto> {
    if (dto.content === undefined && dto.effectiveDate === undefined) {
      throw apiError.badRequest('EMPTY_UPDATE_PAYLOAD');
    }
    const existing = await this.getOrThrow(id, projectId);
    if (dto.content) this.assertContentValid(dto.content);

    const settings = await this.prisma.settings.findUnique({
      where: { projectId },
      select: { vatRate: true },
    });

    await this.prisma.$transaction(async (tx) => {
      // Dans la transaction : un devis émis entre le contrôle et l'écriture passerait au travers.
      await this.assertNoBlockingQuote(tx, projectId, id, false);
      const content = dto.content ? await this.withServerItemIds(tx, projectId, dto.content) : undefined;
      if (content) await this.assertNoDraftUsesRemovedItem(tx, projectId, id, existing.content, content);
      const effectiveDate = dto.effectiveDate ? parseDayOrThrow(dto.effectiveDate) : undefined;
      if (effectiveDate) await this.assertEffectiveDate(tx, projectId, effectiveDate);

      const updated = await tx.pricingGrid.update({
        where: { id },
        data: {
          ...(content && { content: content as Prisma.InputJsonValue }),
          ...(effectiveDate && { effectiveDate }),
        },
        select: { content: true },
      });

      // Les brouillons de cette grille portaient des montants calculés sur l'ancien contenu.
      const recomputed = content
        ? await recomputeDraftQuotes(
            tx,
            this.pricing,
            projectId,
            updated.content as unknown as PricingGridContent,
            id,
            Number(settings?.vatRate ?? 0),
            id,
          )
        : 0;

      await this.audit.log(tx, {
        projectId,
        userId: user.id,
        action: PRICING_AUDIT.GRID_UPDATE,
        objectType: AUDIT_OBJECTS.PRICING_GRID,
        objectId: id,
        metadata: {
          version: existing.version,
          fields: Object.keys(dto),
          wasActive: existing.active,
          draftsRecomputed: recomputed,
          // Le numéro ne bouge pas : sur une grille active, le journal est la seule trace de
          // ce que valaient les prix avant (SPEC-18 §2).
          ...(existing.active && content
            ? { previousContent: existing.content as Prisma.InputJsonValue }
            : {}),
        },
      });
    });

    const grid = await this.getOrThrow(id, projectId);
    return this.toDetail(projectId, grid, grid.content);
  }

  /**
   * SPEC-18 §3 — renoncer à une version préparée. Plus strict que le `PATCH` : **tout** devis
   * retient la grille, brouillon compris. Corriger répare un brouillon ; supprimer le
   * détruirait, `Quote.pricingGrid` étant en `onDelete: Cascade`.
   */
  async remove(id: string, projectId: string, user: AuthenticatedUser): Promise<void> {
    const existing = await this.getOrThrow(id, projectId);
    if (existing.active) throw apiError.conflict('PRICING_GRID_ACTIVE');

    await this.prisma.$transaction(async (tx) => {
      await this.assertNoBlockingQuote(tx, projectId, id, true);
      // La condition est portée par le DELETE lui-même : une activation concurrente entre la
      // lecture ci-dessus et l'écriture laisserait sinon le projet sans grille.
      const { count } = await tx.pricingGrid.deleteMany({ where: { id, active: false } });
      if (count === 0) throw apiError.conflict('PRICING_GRID_ACTIVE');
      await this.audit.log(tx, {
        projectId,
        userId: user.id,
        action: PRICING_AUDIT.GRID_DELETE,
        objectType: AUDIT_OBJECTS.PRICING_GRID,
        objectId: id,
        // Le numéro n'est pas rendu au compteur : il ne désignera jamais une autre version.
        metadata: { version: existing.version, basedOnVersion: existing.basedOnVersion },
      });
    });
  }

  async activate(
    id: string,
    projectId: string,
    dto: ActivatePricingGridDto,
    user: AuthenticatedUser,
  ): Promise<PricingGridDetailDto> {
    const grid = await this.getOrThrow(id, projectId);

    this.assertContentValid(grid.content);

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
      // SPEC-18 §5 — l'activation est le seul moment où l'on sait quand la grille s'applique
      // vraiment : sans date déclarée, c'est aujourd'hui. La figer à la préparation garantit
      // qu'elle sera fausse dès que l'activation glisse d'un jour.
      const effectiveDate = dto.effectiveDate ? parseDayOrThrow(dto.effectiveDate) : todayUtc();
      await this.assertEffectiveDate(tx, projectId, effectiveDate);
      await tx.pricingGrid.update({ where: { id }, data: { active: true, effectiveDate } });

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

  private async activeVersion(projectId: string): Promise<number | null> {
    const active = await this.prisma.pricingGrid.findFirst({
      where: { projectId, active: true },
      select: { version: true },
    });
    return active?.version ?? null;
  }

  /**
   * SPEC-18 §4 — la borne basse d'une date d'effet : aujourd'hui, ou la date de la version
   * active si elle est postérieure. Lue dans la transaction quand il y en a une.
   */
  private async assertEffectiveDate(db: Db, projectId: string, effectiveDate: Date): Promise<void> {
    const active = await db.pricingGrid.findFirst({
      where: { projectId, active: true },
      select: { effectiveDate: true },
    });
    assertEffectiveDateValid(effectiveDate, todayUtc(), active?.effectiveDate ?? null);
  }

  /**
   * SPEC-18 §2 et §3 — ce qui retient une version. Le `PATCH` tolère les brouillons, qu'il
   * recalcule ; le `DELETE` les refuse, parce qu'il les détruirait (Quote.pricingGrid est en
   * Cascade). Compté **dans la transaction** : hors d'elle, un devis créé entre le contrôle et
   * l'écriture passerait au travers.
   */
  private async assertNoBlockingQuote(db: Db, projectId: string, gridId: string, draftsBlock: boolean): Promise<void> {
    const count = await db.quote.count({
      where: {
        projectId,
        pricingGridId: gridId,
        ...(draftsBlock ? {} : { status: { not: QuoteStatus.DRAFT } }),
      },
    });
    if (count > 0) {
      throw withMeta(apiError.conflict('PRICING_GRID_HAS_QUOTES', String(count)), { quotes: count });
    }
  }

  /** Le contrôle de forme, écrit une fois pour la création, la correction et l'activation. */
  private assertContentValid(content: unknown): void {
    const issues = validateGridContent(content);
    if (issues.length) throw withDetails(apiError.badRequest('PRICING_GRID_INVALID', issues.join('; ')), issues);
  }

  /**
   * SPEC-19 D4 — le serveur pose les identifiants d'options et d'extras. Le compteur vit sur le
   * projet et non dans les grilles : corriger une version **en place** efface l'identifiant
   * qu'elle portait, et un compteur déduit des contenus redescendrait. Même forme que le numéro
   * de version (SPEC-18 D6).
   */
  private async withServerItemIds(db: Db, projectId: string, content: Record<string, unknown>): Promise<Record<string, unknown>> {
    const missing = countUnidentifiedItems(content);
    // Un seul écrit, jamais une boucle : on réserve la quantité voulue et on déroule en mémoire.
    const project = missing
      ? await db.project.update({
          where: { id: projectId },
          data: { pricingItemSeq: { increment: missing } },
          select: { pricingItemSeq: true },
        })
      : await db.project.findFirstOrThrow({ where: { id: projectId }, select: { pricingItemSeq: true } });
    return assignItemIds(content, project.pricingItemSeq - missing);
  }

  /**
   * SPEC-19 D2 — un élément que des brouillons référencent ne disparaît pas. Corriger une grille
   * répare ses brouillons ; leur retirer la formule qu'ils portent les rendrait **illisibles**
   * (`PRICING_PLAN_UNKNOWN` à chaque lecture), et leur retirer une option ferait tomber une ligne
   * sans un mot. Compté dans la transaction, comme le décompte de devis.
   */
  private async assertNoDraftUsesRemovedItem(
    db: Db,
    projectId: string,
    gridId: string,
    before: Prisma.JsonValue,
    after: Record<string, unknown>,
  ): Promise<void> {
    const removed = removedGridItems(
      before as unknown as PricingGridContent,
      after as unknown as Partial<PricingGridContent>,
    );
    if (!removed.plans.length && !removed.options.length && !removed.extras.length) return;

    const drafts = await db.quote.findMany({
      where: { projectId, pricingGridId: gridId, status: QuoteStatus.DRAFT, config: { not: Prisma.DbNull } },
      select: { number: true, config: true },
    });
    const used = draftsUsingItems(drafts, removed);
    if (!used.items.length) return;
    throw withMeta(apiError.conflict('PRICING_GRID_ITEM_IN_USE', used.items.join(', ')), {
      items: used.items,
      quotes: used.quotes,
    });
  }

  private async getOrThrow(id: string, projectId: string) {
    const grid = await this.prisma.pricingGrid.findFirst({ where: { id, projectId } });
    if (!grid) throw apiError.notFound('PRICING_GRID_NOT_FOUND', id);
    return grid;
  }

  /** `content` fourni, sinon copie de `fromVersion` ; l'un des deux est obligatoire. */
  private async resolveContent(projectId: string, dto: CreatePricingGridDto): Promise<Record<string, unknown>> {
    if (dto.content) return dto.content;
    if (dto.fromVersion === undefined) throw apiError.badRequest('PRICING_GRID_CONTENT_REQUIRED');
    const source = await this.prisma.pricingGrid.findFirst({
      where: { projectId, version: dto.fromVersion },
      select: { content: true },
    });
    if (!source) throw apiError.notFound('PRICING_GRID_VERSION_NOT_FOUND', String(dto.fromVersion));
    return source.content as Record<string, unknown>;
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

  /**
   * SPEC-18 §6 — la règle d'activation vit ici, pas dans le front. Elle reprend exactement
   * `assertBaseUpToDate` : une version dérivée d'une grille qui n'est plus active porte des prix
   * périmés. Le front grise le bouton et affiche la raison, il ne décide pas.
   */
  private activationOf(row: GridRow, activeVersion: number | null): PricingGridActivationDto {
    if (row.active) return { allowed: false, reason: 'ALREADY_ACTIVE', activeVersion };
    const outdated = isBaseOutdated(row.basedOnVersion, activeVersion);
    return { allowed: !outdated, reason: outdated ? 'BASE_OUTDATED' : null, activeVersion };
  }

  private mapToListItem(
    row: GridRow,
    author: UserWithInitials | undefined,
    quotesCount: number,
    activeVersion: number | null,
  ): PricingGridListItemDto {
    return {
      id: row.id,
      version: row.version,
      effectiveDate: formatDateField(row.effectiveDate),
      active: row.active,
      createdBy: author ? userRef(author, author.id) : null,
      createdAt: row.createdAt.toISOString(),
      quotesCount,
      basedOnVersion: row.basedOnVersion,
      activation: this.activationOf(row, activeVersion),
    };
  }

  private async toDetail(projectId: string, row: GridRow, content: Prisma.JsonValue): Promise<PricingGridDetailDto> {
    const [authors, quotesCount, activeVersion] = await Promise.all([
      loadUsersWithInitials(this.prisma, projectId, row.createdById ? [row.createdById] : []),
      this.prisma.quote.count({ where: { projectId, pricingGridId: row.id } }),
      this.activeVersion(projectId),
    ]);
    return {
      ...this.mapToListItem(row, authors.get(row.createdById ?? ''), quotesCount, activeVersion),
      content: content as unknown as PricingGridContent,
    };
  }
}
