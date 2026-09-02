import { Injectable } from '@nestjs/common';
import { Prisma, Priority, RelationshipStatus } from '@prisma/client';
import { AuthenticatedUser } from '@/auth/interfaces/authenticated-user.interface';
import { completenessScore, recomputeCompleteness } from '@/organizations/organizations.utils';
import { PrismaService } from '@/prisma/prisma.service';
import { REFERENCE_CATEGORIES } from '@/common/messages';
import {
  GENERIC_CONTACT_HEADERS,
  GENERIC_ORGANIZATION_HEADERS,
  GENERIC_SHEETS,
  IMPORT_RESOURCES,
  IMPORT_ROW_CODES,
} from './import-file.constants';
import {
  ParsedWorkbook,
  PreparedImport,
  ReportBuilder,
  SheetRow,
  cellBool,
  normalizeOrgKey,
  splitList,
} from './import-parse.utils';
import { KNOWN_DEPARTMENTS } from './territory.utils';

/** Transaction budget for a full file (2000 rows max, completeness recomputed per touched record). */
const APPLY_TIMEOUT_MS = 60_000;

const ORG_SHEET = GENERIC_SHEETS.organizations;
const CONTACT_SHEET = GENERIC_SHEETS.contacts;
const PRIORITIES = new Set<string>(Object.values(Priority));

/** Organization columns an import may fill on an existing record — only when they are empty. */
const FILLABLE_FIELDS = [
  'displayPrefix',
  'siret',
  'inseeCode',
  'address',
  'postalCode',
  'city',
  'population',
  'epci',
  'phone',
  'email',
  'website',
  'solution',
  'leadSource',
  'salesRepId',
  'notes',
] as const;
type FillableField = (typeof FILLABLE_FIELDS)[number];

interface OrgRowPlan {
  key: string;
  data: Prisma.OrganizationCreateManyInput;
}
interface OrgUpdatePlan {
  id: string;
  data: Partial<Record<FillableField, unknown>> & { tags?: string[]; services?: string[] };
}
interface ContactRowPlan {
  orgKey: string | null; // set when the organization comes from this file
  orgId: string | null; //  set when it already exists in the base
  data: Omit<Prisma.ContactCreateManyInput, 'organizationId' | 'projectId'>;
}

interface ExistingOrg {
  id: string;
  hasPrimary: boolean;
  values: Record<string, unknown>;
}

/**
 * GENERIC profile — our own two-sheet template (Organizations, Contacts), header-matched.
 * Re-running a file never overwrites: an existing record (matched by SIRET, then INSEE code,
 * then department + normalized name — SPEC-05 §5) only has its EMPTY fields filled.
 */
@Injectable()
export class GenericImportService {
  constructor(private readonly prisma: PrismaService) {}

  async plan(projectId: string, sheets: ParsedWorkbook): Promise<PreparedImport> {
    const report = new ReportBuilder();
    for (const name of sheets.keys()) {
      if (name !== ORG_SHEET && name !== CONTACT_SHEET) {
        report.warn(name, 1, IMPORT_ROW_CODES.UNKNOWN_SHEET, `Sheet ${name} is not part of the GENERIC template — ignored`);
      }
    }

    const [refs, members, existing, primaries, existingContacts] = await Promise.all([
      this.loadReferenceKeys(projectId),
      this.loadMembers(projectId),
      this.prisma.organization.findMany({
        where: { projectId, deletedAt: null },
        select: {
          id: true,
          name: true,
          department: true,
          siret: true,
          inseeCode: true,
          displayPrefix: true,
          address: true,
          postalCode: true,
          city: true,
          population: true,
          epci: true,
          phone: true,
          email: true,
          website: true,
          solution: true,
          leadSource: true,
          salesRepId: true,
          notes: true,
          tags: true,
          services: true,
        },
      }),
      this.prisma.contact.findMany({
        where: { projectId, deletedAt: null, isPrimary: true },
        select: { organizationId: true },
      }),
      this.prisma.contact.findMany({
        where: { projectId, deletedAt: null },
        select: { organizationId: true, firstName: true, lastName: true },
      }),
    ]);

    const primaryOrgIds = new Set(primaries.map((c) => c.organizationId));
    const bySiret = new Map<string, ExistingOrg>();
    const byInsee = new Map<string, ExistingOrg>();
    const byKey = new Map<string, ExistingOrg>();
    for (const org of existing) {
      const entry: ExistingOrg = { id: org.id, hasPrimary: primaryOrgIds.has(org.id), values: org };
      if (org.siret) bySiret.set(org.siret, entry);
      if (org.inseeCode) byInsee.set(org.inseeCode, entry);
      byKey.set(normalizeOrgKey(org.department, org.name), entry);
    }
    const contactKeys = new Set(
      existingContacts.map((c) => `${c.organizationId}::${c.firstName.toLowerCase()} ${c.lastName.toLowerCase()}`),
    );

    const creates: OrgRowPlan[] = [];
    const updates: OrgUpdatePlan[] = [];
    const seenSiret = new Set<string>();
    const seenKeys = new Set<string>();
    const fileOrgPrimary = new Map<string, boolean>(); // key -> a primary contact is planned
    const fileOrgKeys = new Set<string>();

    for (const row of sheets.get(ORG_SHEET) ?? []) {
      const plan = this.planOrganizationRow(projectId, row, report, {
        refs,
        members,
        bySiret,
        byInsee,
        byKey,
        seenSiret,
        seenKeys,
      });
      if (!plan) continue;
      if ('id' in plan) updates.push(plan);
      else {
        creates.push(plan);
        fileOrgKeys.add(plan.key);
      }
    }

    const contacts: ContactRowPlan[] = [];
    for (const row of sheets.get(CONTACT_SHEET) ?? []) {
      const plan = this.planContactRow(row, report, { byKey, fileOrgKeys, contactKeys, fileOrgPrimary });
      if (plan) contacts.push(plan);
    }

    return {
      report,
      apply: (batchId, user) => this.apply(projectId, batchId, { creates, updates, contacts }, user),
    };
  }

  // ------------------------------------------------------------------------------ row rules

  private planOrganizationRow(
    projectId: string,
    row: SheetRow,
    report: ReportBuilder,
    ctx: {
      refs: Map<string, Set<string>>;
      members: Map<string, string>;
      bySiret: Map<string, ExistingOrg>;
      byInsee: Map<string, ExistingOrg>;
      byKey: Map<string, ExistingOrg>;
      seenSiret: Set<string>;
      seenKeys: Set<string>;
    },
  ): OrgRowPlan | OrgUpdatePlan | null {
    const c = row.cells;
    const fail = (code: keyof typeof IMPORT_ROW_CODES, message: string, field?: string): null => {
      report.error(ORG_SHEET, row.row, IMPORT_ROW_CODES[code], message, field);
      return null;
    };

    for (const field of ['name', 'type', 'department'] as const) {
      if (!c[field]) return fail('MISSING_REQUIRED', `Column ${field} is required`, field);
    }
    const department = c.department.length === 1 ? `0${c.department}` : c.department;
    if (!KNOWN_DEPARTMENTS.has(department)) {
      return fail('UNKNOWN_DEPARTMENT', `Department ${c.department} is not a known French department`, 'department');
    }
    if (!ctx.refs.get(REFERENCE_CATEGORIES.STRUCTURE_TYPE)?.has(c.type)) {
      return fail('UNKNOWN_REFERENCE', `Structure type ${c.type} is not in the referential`, 'type');
    }
    for (const [field, category] of [
      ['solution', REFERENCE_CATEGORIES.SOLUTION],
      ['leadSource', REFERENCE_CATEGORIES.LEAD_SOURCE],
    ] as const) {
      if (c[field] && !ctx.refs.get(category)?.has(c[field])) {
        return fail('UNKNOWN_REFERENCE', `${field} ${c[field]} is not in the referential`, field);
      }
    }
    const tags = splitList(c.tags ?? '');
    const services = splitList(c.services ?? '');
    for (const [field, list, category] of [
      ['tags', tags, REFERENCE_CATEGORIES.TAG],
      ['services', services, REFERENCE_CATEGORIES.SERVICE],
    ] as const) {
      const unknown = list.find((v) => !ctx.refs.get(category)?.has(v));
      if (unknown) return fail('UNKNOWN_REFERENCE', `${field} value ${unknown} is not in the referential`, field);
    }
    if (c.priority && !PRIORITIES.has(c.priority)) {
      return fail('INVALID_VALUE', `priority must be one of LOW, NORMAL, HIGH`, 'priority');
    }
    let population: number | null = null;
    if (c.population) {
      population = Number(c.population);
      if (!Number.isInteger(population) || population < 0) {
        return fail('INVALID_VALUE', `population must be a whole number`, 'population');
      }
    }
    const siret = c.siret ? c.siret.replace(/\s/g, '') : '';
    if (siret && !/^\d{14}$/.test(siret)) return fail('INVALID_VALUE', `SIRET must be 14 digits`, 'siret');
    if (c.inseeCode && !/^[0-9AB]{5}$/i.test(c.inseeCode)) {
      return fail('INVALID_VALUE', `INSEE code must be 5 characters`, 'inseeCode');
    }
    let salesRepId: string | null = null;
    if (c.salesRep) {
      salesRepId = ctx.members.get(c.salesRep.toLowerCase()) ?? null;
      if (!salesRepId) return fail('UNKNOWN_SALES_REP', `${c.salesRep} is not an active member of the project`, 'salesRep');
    }

    const key = normalizeOrgKey(department, c.name);
    if ((siret && ctx.seenSiret.has(siret)) || ctx.seenKeys.has(key)) {
      return fail('DUPLICATE_ROW', `Same record as an earlier row of this file`);
    }
    if (siret) ctx.seenSiret.add(siret);
    ctx.seenKeys.add(key);

    const fileValues: Record<FillableField, unknown> = {
      displayPrefix: c.displayPrefix || null,
      siret: siret || null,
      inseeCode: c.inseeCode ? c.inseeCode.toUpperCase() : null,
      address: c.address || null,
      postalCode: c.postalCode || null,
      city: c.city || null,
      population,
      epci: c.epci || null,
      phone: c.phone || null,
      email: c.email || null,
      website: c.website || null,
      solution: c.solution || null,
      leadSource: c.leadSource || null,
      salesRepId,
      notes: c.notes || null,
    };

    const match =
      (siret ? ctx.bySiret.get(siret) : undefined) ??
      (fileValues.inseeCode ? ctx.byInsee.get(fileValues.inseeCode as string) : undefined) ??
      ctx.byKey.get(key);

    if (match) {
      // Re-run safety (SPEC-05 §5): fill empty fields only, never overwrite
      const data: OrgUpdatePlan['data'] = {};
      for (const field of FILLABLE_FIELDS) {
        const incoming = fileValues[field];
        if (incoming === null) continue;
        const current = match.values[field];
        if (current === null || current === undefined || current === '') data[field] = incoming;
        else if (String(current) !== String(incoming)) {
          report.warn(
            ORG_SHEET,
            row.row,
            IMPORT_ROW_CODES.FIELD_NOT_OVERWRITTEN,
            `${field} already has a value — the file's is ignored`,
            field,
          );
        }
      }
      const currentTags = (match.values.tags as string[]) ?? [];
      const currentServices = (match.values.services as string[]) ?? [];
      if (tags.length && !currentTags.length) data.tags = tags;
      if (services.length && !currentServices.length) data.services = services;
      if (!Object.keys(data).length) {
        report.skipped(IMPORT_RESOURCES.ORGANIZATIONS);
        return null;
      }
      report.updated(IMPORT_RESOURCES.ORGANIZATIONS);
      return { id: match.id, data };
    }

    report.created(IMPORT_RESOURCES.ORGANIZATIONS);
    return {
      key,
      data: {
        projectId,
        name: c.name,
        type: c.type,
        department,
        ...(fileValues as Record<string, never>),
        tags,
        services,
        priority: (c.priority as Priority) || Priority.NORMAL,
        completenessScore: completenessScore({
          siret: (fileValues.siret as string) ?? null,
          address: (fileValues.address as string) ?? null,
          postalCode: (fileValues.postalCode as string) ?? null,
          population,
          email: (fileValues.email as string) ?? null,
          hasPrimaryContact: false,
        }),
      },
    };
  }

  private planContactRow(
    row: SheetRow,
    report: ReportBuilder,
    ctx: {
      byKey: Map<string, ExistingOrg>;
      fileOrgKeys: Set<string>;
      contactKeys: Set<string>;
      fileOrgPrimary: Map<string, boolean>;
    },
  ): ContactRowPlan | null {
    const c = row.cells;
    const fail = (code: keyof typeof IMPORT_ROW_CODES, message: string, field?: string): null => {
      report.error(CONTACT_SHEET, row.row, IMPORT_ROW_CODES[code], message, field);
      return null;
    };
    for (const field of ['organization', 'department', 'firstName', 'lastName'] as const) {
      if (!c[field]) return fail('MISSING_REQUIRED', `Column ${field} is required`, field);
    }
    const department = c.department.length === 1 ? `0${c.department}` : c.department;
    const key = normalizeOrgKey(department, c.organization);
    const existing = ctx.byKey.get(key);
    const fromFile = ctx.fileOrgKeys.has(key);
    if (!existing && !fromFile) {
      return fail('ORGANIZATION_NOT_FOUND', `${c.organization} (${department}) is neither in the file nor in the base`, 'organization');
    }

    if (existing && ctx.contactKeys.has(`${existing.id}::${c.firstName.toLowerCase()} ${c.lastName.toLowerCase()}`)) {
      report.skipped(IMPORT_RESOURCES.CONTACTS);
      return null;
    }

    let isPrimary = cellBool(c.isPrimary ?? '');
    const alreadyPrimary = existing?.hasPrimary || ctx.fileOrgPrimary.get(key) === true;
    if (isPrimary && alreadyPrimary) {
      report.warn(
        CONTACT_SHEET,
        row.row,
        IMPORT_ROW_CODES.PRIMARY_ALREADY_SET,
        `${c.organization} already has a primary contact — imported as secondary`,
        'isPrimary',
      );
      isPrimary = false;
    }
    if (isPrimary) ctx.fileOrgPrimary.set(key, true);

    report.created(IMPORT_RESOURCES.CONTACTS);
    return {
      orgKey: fromFile && !existing ? key : null,
      orgId: existing?.id ?? null,
      data: {
        civility: c.civility || null,
        firstName: c.firstName,
        lastName: c.lastName,
        role: c.role || null,
        email: c.email || null,
        phone: c.phone || null,
        mobile: c.mobile || null,
        isPrimary,
        optOut: cellBool(c.optOut ?? ''),
        notes: c.notes || null,
      },
    };
  }

  // ------------------------------------------------------------------------------ apply

  private async apply(
    projectId: string,
    batchId: string,
    plan: { creates: OrgRowPlan[]; updates: OrgUpdatePlan[]; contacts: ContactRowPlan[] },
    _user: AuthenticatedUser,
  ): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const created = await tx.organization.createManyAndReturn({
          data: plan.creates.map((c) => ({ ...c.data, importBatchId: batchId })),
          select: { id: true, name: true, department: true },
        });
        const idByKey = new Map(created.map((o) => [normalizeOrgKey(o.department, o.name), o.id]));

        for (const update of plan.updates) {
          await tx.organization.update({ where: { id: update.id }, data: update.data as Prisma.OrganizationUncheckedUpdateInput });
        }

        const contactRows = plan.contacts.map((c) => ({
          ...c.data,
          projectId,
          importBatchId: batchId,
          organizationId: c.orgId ?? idByKey.get(c.orgKey!)!,
        }));
        if (contactRows.length) await tx.contact.createMany({ data: contactRows });

        // Completeness follows every touched record (fields filled, primary contact added)
        const touched = new Set<string>([
          ...plan.updates.map((u) => u.id),
          ...contactRows.map((c) => c.organizationId),
          ...created.filter((o) => contactRows.some((c) => c.organizationId === o.id)).map((o) => o.id),
        ]);
        for (const id of touched) await recomputeCompleteness(tx, id);
      },
      { timeout: APPLY_TIMEOUT_MS },
    );
  }

  // ------------------------------------------------------------------------------ loads

  private async loadReferenceKeys(projectId: string): Promise<Map<string, Set<string>>> {
    const rows = await this.prisma.referenceItem.findMany({
      where: { projectId, active: true },
      select: { category: true, key: true },
    });
    const map = new Map<string, Set<string>>();
    for (const r of rows) {
      if (!map.has(r.category)) map.set(r.category, new Set());
      map.get(r.category)!.add(r.key);
    }
    return map;
  }

  /** Active members addressed by email in the salesRep column. */
  private async loadMembers(projectId: string): Promise<Map<string, string>> {
    const rows = await this.prisma.userRoleProject.findMany({
      where: { projectId, status: RelationshipStatus.ACTIVE },
      select: { userId: true, user: { select: { email: true } } },
    });
    return new Map(rows.map((r) => [r.user.email.toLowerCase(), r.userId]));
  }
}
