import { HttpException, Injectable, Logger } from '@nestjs/common';
import { Prisma, ScopeNature } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { AuthenticatedUser } from '@/auth/interfaces/authenticated-user.interface';
import { AuditLogService } from '@/audit-log/audit-log.service';
import { AUDIT_OBJECTS } from '@/audit-log/audit-log.constants';
import { DAY_PATTERN } from '@/common/utils/date.utils';
import { PrismaService } from '@/prisma/prisma.service';
import { REFERENCE_CATEGORIES } from '@/projects/project-config.constants';
import { CONFIG_SHEETS } from '@/projects/projects.constants';
import { REFERENCE_ITEMS_AUDIT, REFERENCE_KEY_PATTERN } from '@/reference-items/reference-items.constants';
import { SCOPES_AUDIT } from '@/scopes/scopes.constants';
import { findRegion } from '@/scopes/geo.constants';
import { FIXED_STAGE_PROBABILITIES, STAGE_KEYS } from '@/settings/settings.constants';
import { SettingsService } from '@/settings/settings.service';
import { UpdateSettingsDto } from '@/settings/dto/update-settings.dto';
import { UsersService } from '@/users/users.service';
import { CreateUserDto } from '@/users/dto/create-user.dto';
import { IMPORT_RESOURCES, IMPORT_ROW_CODES } from './import-file.constants';
import { ParsedWorkbook, PreparedImport, ReportBuilder, SheetRow, cellBool, splitList } from './import-parse.utils';
import {
  ACTION_MAP,
  EDITOR_MAP,
  ETIQUETTE_MAP,
  PARAM_BLOCKS,
  SALES_PERSON_MAP,
  SECTOR_REGIONS,
  SOLUTION_LABELS,
  SOURCE_MAP,
  WEIGHTS_TO_STAGES,
} from './ouicrm.constants';
import { canonical, scanParamBlocks } from './ouicrm.utils';
import { KNOWN_DEPARTMENTS } from './territory.utils';
import { REGIONS } from '@/scopes/geo.constants';

/** §3.2 — pipeline vocabulary of the workbook, validated by entry A (quotes land at L2). */
const PIPELINE_VOCABULARY = new Set(
  ['ANALYSE DEVIS', 'RELANCE', 'NÉGOCIATION', 'ACCORD ORAL', 'SIGNÉ - VALIDÉ', 'SANS SUITE - SS', 'ABANDONNÉ / PERDU'],
);
const REGION_BY_CANONICAL = new Map(REGIONS.map((r) => [canonical(r.name), r.name]));

/** Numeric settings keys of the Settings sheet — everything else is company.* or identity. */
const NUMERIC_SETTINGS = [
  'vatRate',
  'revenueTarget',
  'meetingTarget',
  'quoteValidityDays',
  'noticeMonths',
  'defaultCommitmentMonths',
  'discountCap',
  'retentionMonths',
] as const;
type NumericSetting = (typeof NUMERIC_SETTINGS)[number];

/** The export writes the project identity in the Settings sheet — an import never renames a project. */
const IDENTITY_KEYS = new Set(['slug', 'name', 'productName', 'description']);

const CATEGORY_SET = new Set<string>(REFERENCE_CATEGORIES);
const NATURES = new Set<string>(Object.values(ScopeNature));

interface ReferenceUpsert {
  id: string | null;
  category: string;
  key: string;
  data: { label: string; order: number | null; active: boolean | null; metadata: Prisma.InputJsonValue | null };
}
interface ScopeUpsert {
  id: string | null;
  name: string;
  data: {
    description: string | null;
    regions: string[];
    departments: string[];
    portfolioOnly: boolean;
    nature: ScopeNature;
  };
}
interface UserCreate {
  row: number;
  dto: CreateUserDto;
}

/**
 * PROJECT_CONFIG profile (SPEC-10 §3.3, entry B) — the template IS the config export: sheets
 * Settings, StageProbabilities, ReferenceItems, Scopes, Users. Merge only: an existing value
 * (same key) is updated, a value absent from the file is never removed, users are created
 * PENDING with an activation email and attached when they already exist. Idempotent —
 * replaying the same file reports 0 created.
 * The workbook's own ⚙️ Paramètres tab (entry A) ships with the OUICRM_V2_1 profile (D2).
 */
@Injectable()
export class ProjectConfigImportService {
  private readonly logger = new Logger(ProjectConfigImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly settings: SettingsService,
    private readonly users: UsersService,
  ) {}

  async plan(projectId: string, sheets: ParsedWorkbook, workbook?: ExcelJS.Workbook | null): Promise<PreparedImport> {
    const report = new ReportBuilder();
    const known = new Set<string>(Object.values(CONFIG_SHEETS));
    for (const name of sheets.keys()) {
      if (!known.has(name)) {
        report.warn(name, 1, IMPORT_ROW_CODES.UNKNOWN_SHEET, `Sheet ${name} is not part of the PROJECT_CONFIG template — ignored`);
      }
    }

    const [current, referenceItems, scopes, members, roles] = await Promise.all([
      this.prisma.settings.findFirst({ where: { projectId } }),
      this.prisma.referenceItem.findMany({ where: { projectId } }),
      this.prisma.scope.findMany({ where: { projectId } }),
      this.prisma.userRoleProject.findMany({
        where: { projectId },
        select: { initials: true, status: true, user: { select: { email: true } } },
      }),
      this.prisma.role.findMany({
        where: { isBackoffice: false, OR: [{ projectId }, { projectId: null, isSystem: true }] },
        select: { code: true },
      }),
    ]);

    const settingsPatch = this.planSettings(sheets.get(CONFIG_SHEETS.settings) ?? [], current, report);
    let stagesPatch = this.planStages(sheets.get(CONFIG_SHEETS.stageProbabilities) ?? [], current, report);
    const refUpserts = this.planReferenceItems(sheets.get(CONFIG_SHEETS.referenceItems) ?? [], referenceItems, report);
    const scopeUpserts = this.planScopes(sheets.get(CONFIG_SHEETS.scopes) ?? [], scopes, report);

    // Entry A (SPEC-10 §3.3): a workbook without the template sheets but carrying the real
    // ⚙️ Paramètres tab — its blocks feed the same upserts through the same rules
    const hasTemplateRows = Object.values(CONFIG_SHEETS).some((name) => (sheets.get(name) ?? []).length > 0);
    if (!hasTemplateRows && workbook) {
      stagesPatch = this.planEntryA(
        workbook,
        { current, referenceItems, scopes, memberInitials: new Set(members.map((m) => m.initials)) },
        { refUpserts, scopeUpserts, stagesPatch },
        report,
      );
    }
    const userCreates = this.planUsers(
      sheets.get(CONFIG_SHEETS.users) ?? [],
      {
        // Any existing relation counts (PENDING included): the import invites, it never re-wires
        emails: new Set(members.map((m) => m.user.email.toLowerCase())),
        initials: new Set(members.map((m) => m.initials)),
        roles: new Set(roles.map((r) => r.code)),
        // A user row may point at a scope created by the same file (Scopes sheet applies first)
        scopeNames: new Set([...scopes.map((s) => s.name), ...scopeUpserts.map((s) => s.name)]),
      },
      report,
    );

    return {
      report,
      apply: (batchId, user) =>
        this.apply(projectId, { settingsPatch, stagesPatch, refUpserts, scopeUpserts, userCreates }, report, user),
    };
  }

  // ------------------------------------------------------------------------------ per sheet

  private planSettings(
    rows: SheetRow[],
    current: { [k: string]: unknown; company?: unknown } | null,
    report: ReportBuilder,
  ): UpdateSettingsDto | null {
    const sheet = CONFIG_SHEETS.settings;
    const patch: Record<string, unknown> = {};
    const company: Record<string, string> = {};
    const currentCompany = ((current?.company ?? {}) as Record<string, string>) || {};

    for (const row of rows) {
      const key = row.cells.key;
      const value = row.cells.value ?? '';
      if (!key) continue;
      if (IDENTITY_KEYS.has(key)) {
        report.warn(sheet, row.row, IMPORT_ROW_CODES.PROJECT_IDENTITY_IGNORED, `${key} belongs to the project identity — an import never changes it`, key);
        continue;
      }
      if (key.startsWith('company.')) {
        const field = key.slice('company.'.length);
        if ((currentCompany[field] ?? '') === value) report.skipped(IMPORT_RESOURCES.SETTINGS);
        else {
          company[field] = value;
          report.updated(IMPORT_RESOURCES.SETTINGS);
        }
        continue;
      }
      if ((NUMERIC_SETTINGS as readonly string[]).includes(key)) {
        const num = Number(value);
        if (!Number.isFinite(num)) {
          report.error(sheet, row.row, IMPORT_ROW_CODES.INVALID_VALUE, `${key} must be a number`, key);
          continue;
        }
        if (current && Number(current[key as NumericSetting]) === num) report.skipped(IMPORT_RESOURCES.SETTINGS);
        else {
          patch[key] = num;
          report.updated(IMPORT_RESOURCES.SETTINGS);
        }
        continue;
      }
      report.warn(sheet, row.row, IMPORT_ROW_CODES.UNKNOWN_SETTING, `${key} is not a known setting — ignored`, key);
    }

    if (Object.keys(company).length) patch.company = company;
    return Object.keys(patch).length ? (patch as UpdateSettingsDto) : null;
  }

  private planStages(
    rows: SheetRow[],
    current: { stageProbabilities?: unknown } | null,
    report: ReportBuilder,
  ): Record<string, number> | null {
    const sheet = CONFIG_SHEETS.stageProbabilities;
    const currentStages = (current?.stageProbabilities ?? {}) as Record<string, number>;
    const patch: Record<string, number> = {};
    for (const row of rows) {
      const stage = row.cells.stage;
      if (!stage) continue;
      if (!STAGE_KEYS.includes(stage)) {
        report.error(sheet, row.row, IMPORT_ROW_CODES.INVALID_VALUE, `${stage} is not a pipeline stage`, 'stage');
        continue;
      }
      const value = Number(row.cells.probability);
      if (!Number.isInteger(value) || value < 0 || value > 100) {
        report.error(sheet, row.row, IMPORT_ROW_CODES.INVALID_VALUE, `probability must be a whole number between 0 and 100`, 'probability');
        continue;
      }
      const fixed = FIXED_STAGE_PROBABILITIES[stage];
      if (fixed !== undefined && value !== fixed) {
        report.error(sheet, row.row, IMPORT_ROW_CODES.STAGE_PROBABILITY_FIXED, `${stage} is fixed at ${fixed}`, 'probability');
        continue;
      }
      if (currentStages[stage] === value) report.skipped(IMPORT_RESOURCES.STAGE_PROBABILITIES);
      else {
        patch[stage] = value;
        report.updated(IMPORT_RESOURCES.STAGE_PROBABILITIES);
      }
    }
    return Object.keys(patch).length ? patch : null;
  }

  private planReferenceItems(
    rows: SheetRow[],
    existing: { id: string; category: string; key: string; label: string; order: number; active: boolean; metadata: unknown }[],
    report: ReportBuilder,
  ): ReferenceUpsert[] {
    const sheet = CONFIG_SHEETS.referenceItems;
    const byKey = new Map(existing.map((r) => [`${r.category}::${r.key}`, r]));
    const seen = new Set<string>();
    const out: ReferenceUpsert[] = [];

    for (const row of rows) {
      const c = row.cells;
      if (!c.category || !c.key || !c.label) {
        report.error(sheet, row.row, IMPORT_ROW_CODES.MISSING_REQUIRED, `category, key and label are required`);
        continue;
      }
      if (!CATEGORY_SET.has(c.category)) {
        report.error(sheet, row.row, IMPORT_ROW_CODES.UNKNOWN_REFERENCE, `${c.category} is not a referential category`, 'category');
        continue;
      }
      if (!REFERENCE_KEY_PATTERN.test(c.key)) {
        report.error(sheet, row.row, IMPORT_ROW_CODES.INVALID_VALUE, `key must match ${String(REFERENCE_KEY_PATTERN)}`, 'key');
        continue;
      }
      const mapKey = `${c.category}::${c.key}`;
      if (seen.has(mapKey)) {
        report.error(sheet, row.row, IMPORT_ROW_CODES.DUPLICATE_ROW, `Same category and key as an earlier row`);
        continue;
      }
      seen.add(mapKey);

      let order: number | null = null;
      if (c.order) {
        order = Number(c.order);
        if (!Number.isInteger(order)) {
          report.error(sheet, row.row, IMPORT_ROW_CODES.INVALID_VALUE, `order must be a whole number`, 'order');
          continue;
        }
      }
      let metadata: Prisma.InputJsonValue | null = null;
      if (c.metadata) {
        try {
          metadata = JSON.parse(c.metadata) as Prisma.InputJsonValue;
        } catch {
          report.error(sheet, row.row, IMPORT_ROW_CODES.INVALID_VALUE, `metadata must be valid JSON`, 'metadata');
          continue;
        }
      }
      const active = c.active ? cellBool(c.active) : null;

      const match = byKey.get(mapKey);
      if (!match) {
        report.created(IMPORT_RESOURCES.REFERENCE_ITEMS);
        out.push({ id: null, category: c.category, key: c.key, data: { label: c.label, order, active, metadata } });
        continue;
      }
      const changed =
        match.label !== c.label ||
        (order !== null && match.order !== order) ||
        (active !== null && match.active !== active) ||
        (metadata !== null && JSON.stringify(match.metadata ?? {}) !== JSON.stringify(metadata));
      if (!changed) {
        report.skipped(IMPORT_RESOURCES.REFERENCE_ITEMS);
        continue;
      }
      report.updated(IMPORT_RESOURCES.REFERENCE_ITEMS);
      out.push({ id: match.id, category: c.category, key: c.key, data: { label: c.label, order, active, metadata } });
    }
    return out;
  }

  private planScopes(
    rows: SheetRow[],
    existing: { id: string; name: string; description: string | null; regions: string[]; departments: string[]; portfolioOnly: boolean; nature: ScopeNature }[],
    report: ReportBuilder,
  ): ScopeUpsert[] {
    const sheet = CONFIG_SHEETS.scopes;
    const byName = new Map(existing.map((s) => [s.name, s]));
    const seen = new Set<string>();
    const out: ScopeUpsert[] = [];

    for (const row of rows) {
      const c = row.cells;
      if (!c.name) {
        report.error(sheet, row.row, IMPORT_ROW_CODES.MISSING_REQUIRED, `name is required`, 'name');
        continue;
      }
      if (seen.has(c.name)) {
        report.error(sheet, row.row, IMPORT_ROW_CODES.DUPLICATE_ROW, `Same scope name as an earlier row`);
        continue;
      }
      seen.add(c.name);

      const regions = splitList((c.regions ?? '').replace(/,/g, '|'));
      const departments = splitList((c.departments ?? '').replace(/,/g, '|'));
      const badRegion = regions.find((r) => !findRegion(r));
      if (badRegion) {
        report.error(sheet, row.row, IMPORT_ROW_CODES.INVALID_VALUE, `${badRegion} is not a known region`, 'regions');
        continue;
      }
      const badDept = departments.find((d) => !KNOWN_DEPARTMENTS.has(d));
      if (badDept) {
        report.error(sheet, row.row, IMPORT_ROW_CODES.UNKNOWN_DEPARTMENT, `${badDept} is not a known department`, 'departments');
        continue;
      }
      const nature = (c.nature || ScopeNature.ALL) as ScopeNature;
      if (!NATURES.has(nature)) {
        report.error(sheet, row.row, IMPORT_ROW_CODES.INVALID_VALUE, `nature must be one of ${[...NATURES].join(', ')}`, 'nature');
        continue;
      }
      const data: ScopeUpsert['data'] = {
        description: c.description || null,
        regions,
        departments,
        portfolioOnly: cellBool(c.portfolioOnly ?? ''),
        nature,
      };

      const match = byName.get(c.name);
      if (!match) {
        report.created(IMPORT_RESOURCES.SCOPES);
        out.push({ id: null, name: c.name, data });
        continue;
      }
      const changed =
        (match.description ?? null) !== data.description ||
        JSON.stringify(match.regions) !== JSON.stringify(regions) ||
        JSON.stringify(match.departments) !== JSON.stringify(departments) ||
        match.portfolioOnly !== data.portfolioOnly ||
        match.nature !== nature;
      if (!changed) {
        report.skipped(IMPORT_RESOURCES.SCOPES);
        continue;
      }
      report.updated(IMPORT_RESOURCES.SCOPES);
      out.push({ id: match.id, name: c.name, data });
    }
    return out;
  }

  private planUsers(
    rows: SheetRow[],
    ctx: { emails: Set<string>; initials: Set<string>; roles: Set<string>; scopeNames: Set<string> },
    report: ReportBuilder,
  ): UserCreate[] {
    const sheet = CONFIG_SHEETS.users;
    const seen = new Set<string>();
    const out: UserCreate[] = [];

    for (const row of rows) {
      const c = row.cells;
      const fail = (code: keyof typeof IMPORT_ROW_CODES, message: string, field?: string): void => {
        report.error(sheet, row.row, IMPORT_ROW_CODES[code], message, field);
      };
      if (!c.email || !c.firstName || !c.lastName || !c.role || !c.initials) {
        fail('MISSING_REQUIRED', `email, firstName, lastName, role and initials are required`);
        continue;
      }
      const email = c.email.toLowerCase();
      if (seen.has(email)) {
        fail('DUPLICATE_ROW', `Same email as an earlier row`);
        continue;
      }
      seen.add(email);
      if (ctx.emails.has(email)) {
        // Already a member: the import adds, it never re-wires an existing access
        report.skipped(IMPORT_RESOURCES.USERS);
        report.warn(sheet, row.row, IMPORT_ROW_CODES.ALREADY_MEMBER, `${c.email} is already a member — role and scope left as they are`);
        continue;
      }
      if (!ctx.roles.has(c.role)) {
        fail('UNKNOWN_ROLE', `${c.role} is not an assignable role of the project`, 'role');
        continue;
      }
      if (c.scope && !ctx.scopeNames.has(c.scope)) {
        fail('UNKNOWN_SCOPE', `${c.scope} is not a scope of the project`, 'scope');
        continue;
      }
      if (!/^[A-Z0-9]{2,3}$/.test(c.initials)) {
        fail('INVALID_VALUE', `initials must be 2-3 uppercase letters or digits`, 'initials');
        continue;
      }
      if (ctx.initials.has(c.initials)) {
        fail('INITIALS_ALREADY_USED', `${c.initials} is already used in the project`, 'initials');
        continue;
      }
      ctx.initials.add(c.initials);
      if (c.expiresAt && !DAY_PATTERN.test(c.expiresAt)) {
        fail('INVALID_VALUE', `expiresAt must be YYYY-MM-DD`, 'expiresAt');
        continue;
      }

      report.created(IMPORT_RESOURCES.USERS);
      out.push({
        row: row.row,
        dto: {
          email: c.email,
          firstName: c.firstName,
          lastName: c.lastName,
          initials: c.initials,
          roleCode: c.role,
          scopeName: c.scope || null,
          isExternal: Boolean(c.expiresAt),
          expiresAt: c.expiresAt || undefined,
        } as unknown as CreateUserDto,
      });
    }
    return out;
  }

  // ------------------------------------------------------------------------------ entry A

  /**
   * SPEC-10 §3.3, entry A — the real workbook's ⚙️ Paramètres tab. Blocks located by header
   * (emojis stripped), values read down to the first empty cell, correspondence tables of
   * SPEC-05 §3.3-3.6. Merge only, and a scope that already exists is NEVER rewritten
   * (access control). Returns the stagesPatch (weights initialize 25/60/80 — SPEC-10 §2).
   */
  private planEntryA(
    workbook: ExcelJS.Workbook,
    ctx: {
      current: { stageProbabilities?: unknown } | null;
      referenceItems: { category: string; key: string }[];
      scopes: { name: string }[];
      memberInitials: Set<string>;
    },
    out: { refUpserts: ReferenceUpsert[]; scopeUpserts: ScopeUpsert[]; stagesPatch: Record<string, number> | null },
    report: ReportBuilder,
  ): Record<string, number> | null {
    const knownBlocks = Object.values(PARAM_BLOCKS);
    let sheetName = '';
    let blocks = new Map<string, string[]>();
    let unknown: string[] = [];
    workbook.eachSheet((sheet) => {
      const scan = scanParamBlocks(sheet, knownBlocks);
      if (scan.blocks.size > blocks.size) {
        blocks = scan.blocks;
        unknown = scan.unknown;
        sheetName = sheet.name;
      }
    });
    if (!blocks.size) return out.stagesPatch;

    for (const name of unknown) {
      report.warn(sheetName, 1, IMPORT_ROW_CODES.UNKNOWN_BLOCK, `Block « ${name} » is not part of the configuration — ignored`);
    }
    const hasRef = (category: string, key: string): boolean =>
      ctx.referenceItems.some((r) => r.category === category && r.key === key);
    const pushRef = (category: string, key: string, label: string): void => {
      if (hasRef(category, key) || out.refUpserts.some((u) => u.category === category && u.key === key)) {
        report.skipped(IMPORT_RESOURCES.REFERENCE_ITEMS);
        return;
      }
      report.created(IMPORT_RESOURCES.REFERENCE_ITEMS);
      out.refUpserts.push({ id: null, category, key, data: { label, order: null, active: null, metadata: null } });
    };

    for (const value of blocks.get(PARAM_BLOCKS.ETIQUETTES) ?? []) {
      const mapped = ETIQUETTE_MAP[canonical(value)];
      if (!mapped) {
        report.warn(sheetName, 1, IMPORT_ROW_CODES.INVALID_VALUE, `Étiquette « ${value} » outside the Chaud/Tiède/Froid rule`, 'ÉTIQUETTES');
      } else if (mapped.tag) {
        pushRef('TAG', mapped.tag, 'Chaud');
      }
    }
    for (const value of blocks.get(PARAM_BLOCKS.EDITORS) ?? []) {
      const key = EDITOR_MAP[canonical(value)];
      if (!key) {
        report.warn(sheetName, 1, IMPORT_ROW_CODES.UNKNOWN_EDITOR, `Éditeur « ${value} » outside the §3.4 table — map it by hand`, 'ÉDITEURS');
        continue;
      }
      pushRef('SOLUTION', key, SOLUTION_LABELS[key] ?? value);
    }
    for (const value of blocks.get(PARAM_BLOCKS.SOURCES) ?? []) {
      if (!SOURCE_MAP[canonical(value)]) {
        report.warn(sheetName, 1, IMPORT_ROW_CODES.UNKNOWN_REFERENCE, `Source « ${value} » outside the §3.3 table`, 'SOURCES');
      }
    }
    for (const value of blocks.get(PARAM_BLOCKS.ACTIONS) ?? []) {
      if (!ACTION_MAP[canonical(value)]) {
        report.warn(sheetName, 1, IMPORT_ROW_CODES.UNKNOWN_REFERENCE, `Action « ${value} » outside the §3.5 table`, 'ACTIONS / COMMENTAIRES');
      }
    }
    for (const value of blocks.get(PARAM_BLOCKS.PIPELINE) ?? []) {
      if (!PIPELINE_VOCABULARY.has(canonical(value))) {
        report.warn(sheetName, 1, IMPORT_ROW_CODES.INVALID_VALUE, `Statut pipeline « ${value} » outside the §3.2 table (quotes land at L2)`, 'STATUTS PIPELINE');
      }
    }
    for (const value of blocks.get(PARAM_BLOCKS.SALES_PEOPLE) ?? []) {
      const initials = SALES_PERSON_MAP[canonical(value)];
      if (!initials || !ctx.memberInitials.has(initials)) {
        report.warn(sheetName, 1, IMPORT_ROW_CODES.UNKNOWN_SALES_PERSON, `« ${value} » has no active member behind it (§3.6 — demo value?)`, 'COMMERCIAUX');
      }
    }

    // Weights initialize the three configurable stages (SPEC-10 §2); WON/LOST stay fixed
    let stagesPatch = out.stagesPatch;
    if (blocks.has(PARAM_BLOCKS.WEIGHTS)) {
      const currentStages = (ctx.current?.stageProbabilities ?? {}) as Record<string, number>;
      const patch: Record<string, number> = { ...(stagesPatch ?? {}) };
      for (const [stage, value] of Object.entries(WEIGHTS_TO_STAGES)) {
        if (currentStages[stage] === value) report.skipped(IMPORT_RESOURCES.STAGE_PROBABILITIES);
        else {
          patch[stage] = value;
          report.updated(IMPORT_RESOURCES.STAGE_PROBABILITIES);
        }
      }
      stagesPatch = Object.keys(patch).length ? patch : null;
    }

    // A sector becomes a scope only when no scope carries that name yet — access control is
    // never rewritten by an import
    const scopeNames = new Set(ctx.scopes.map((s) => canonical(s.name)));
    for (const value of blocks.get(PARAM_BLOCKS.SECTORS) ?? []) {
      if (scopeNames.has(canonical(value)) || out.scopeUpserts.some((u) => canonical(u.name) === canonical(value))) {
        report.skipped(IMPORT_RESOURCES.SCOPES);
        continue;
      }
      const regions =
        SECTOR_REGIONS[canonical(value)] ??
        (REGION_BY_CANONICAL.has(canonical(value)) ? [REGION_BY_CANONICAL.get(canonical(value))!] : null);
      if (!regions) {
        report.warn(sheetName, 1, IMPORT_ROW_CODES.UNKNOWN_SECTOR, `Secteur « ${value} » matches no region — empty scope created, to complete by hand`, 'SECTEURS / INSTANCES');
      }
      report.created(IMPORT_RESOURCES.SCOPES);
      out.scopeUpserts.push({
        id: null,
        name: value,
        data: { description: 'Importé du classeur (entrée A)', regions: regions ?? [], departments: [], portfolioOnly: false, nature: ScopeNature.ALL },
      });
    }
    return stagesPatch;
  }

  // ------------------------------------------------------------------------------ apply

  private async apply(
    projectId: string,
    plan: {
      settingsPatch: UpdateSettingsDto | null;
      stagesPatch: Record<string, number> | null;
      refUpserts: ReferenceUpsert[];
      scopeUpserts: ScopeUpsert[];
      userCreates: UserCreate[];
    },
    report: ReportBuilder,
    user: AuthenticatedUser,
  ): Promise<void> {
    // Settings and stage probabilities go through their single writer (merge + WON/LOST rules + audit)
    if (plan.settingsPatch || plan.stagesPatch) {
      await this.settings.update(
        projectId,
        { ...(plan.settingsPatch ?? {}), ...(plan.stagesPatch ? { stageProbabilities: plan.stagesPatch } : {}) },
        user,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      for (const item of plan.refUpserts) {
        if (item.id) {
          const row = await tx.referenceItem.update({
            where: { id: item.id },
            data: {
              label: item.data.label,
              ...(item.data.order !== null ? { order: item.data.order } : {}),
              ...(item.data.active !== null ? { active: item.data.active } : {}),
              ...(item.data.metadata !== null ? { metadata: item.data.metadata } : {}),
            },
          });
          await this.audit.log(tx, {
            projectId,
            userId: user.id,
            action: REFERENCE_ITEMS_AUDIT.UPDATE,
            objectType: AUDIT_OBJECTS.REFERENCE_ITEM,
            objectId: row.id,
            metadata: { category: row.category, key: row.key, import: true },
          });
        } else {
          const last = await tx.referenceItem.aggregate({
            where: { projectId, category: item.category },
            _max: { order: true },
          });
          const row = await tx.referenceItem.create({
            data: {
              projectId,
              category: item.category,
              key: item.key,
              label: item.data.label,
              order: item.data.order ?? (last._max.order ?? 0) + 1,
              active: item.data.active ?? true,
              metadata: item.data.metadata ?? {},
            },
          });
          await this.audit.log(tx, {
            projectId,
            userId: user.id,
            action: REFERENCE_ITEMS_AUDIT.CREATE,
            objectType: AUDIT_OBJECTS.REFERENCE_ITEM,
            objectId: row.id,
            metadata: { category: row.category, key: row.key, import: true },
          });
        }
      }

      for (const scope of plan.scopeUpserts) {
        if (scope.id) {
          await tx.scope.update({ where: { id: scope.id }, data: scope.data as Prisma.ScopeUncheckedUpdateInput });
          await this.audit.log(tx, {
            projectId,
            userId: user.id,
            action: SCOPES_AUDIT.UPDATE,
            objectType: AUDIT_OBJECTS.SCOPE,
            objectId: scope.id,
            metadata: { name: scope.name, import: true },
          });
        } else {
          const row = await tx.scope.create({ data: { projectId, name: scope.name, ...scope.data } as Prisma.ScopeUncheckedCreateInput });
          await this.audit.log(tx, {
            projectId,
            userId: user.id,
            action: SCOPES_AUDIT.CREATE,
            objectType: AUDIT_OBJECTS.SCOPE,
            objectId: row.id,
            metadata: { name: scope.name, import: true },
          });
        }
      }
    });

    // Users go through their single writer too: PENDING + activation email, attach if existing
    const scopeIdByName = new Map(
      (await this.prisma.scope.findMany({ where: { projectId }, select: { id: true, name: true } })).map((s) => [
        s.name,
        s.id,
      ]),
    );
    for (const create of plan.userCreates) {
      const { scopeName, ...dto } = create.dto as CreateUserDto & { scopeName: string | null };
      try {
        await this.users.create(
          projectId,
          { ...dto, scopeId: scopeName ? (scopeIdByName.get(scopeName) ?? null) : null } as CreateUserDto,
          user,
        );
      } catch (err) {
        // Plan-time checks make this exceptional (a race): surface it as a row error
        const code = err instanceof HttpException ? ((err.getResponse() as { code?: string }).code ?? 'ERROR') : 'ERROR';
        report.error(CONFIG_SHEETS.users, create.row, IMPORT_ROW_CODES.INVALID_VALUE, `${dto.email}: ${code}`);
        this.logger.warn(`Config import: user ${dto.email} not created (${code})`);
      }
    }
  }
}
