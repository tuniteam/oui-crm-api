import { DocumentTemplateType, Prisma, Settings } from '@prisma/client';
import * as Handlebars from 'handlebars';
import { apiError } from '@/common/api-error';
import { MS_PER_DAY } from '@/common/utils/date.utils';
import { PrismaService } from '@/prisma/prisma.service';
import { DEFAULT_STAGE_PROBABILITIES } from '@/projects/project-config.constants';
import { NumberingExamplesDto, TemplateItemDto } from './dto/response-documents.dto';
import { SettingsResponseDto } from './dto/response-settings.dto';
import { CompanyDto } from './dto/update-settings.dto';
import {
  COMPANY_FIELDS,
  CompanyField,
  FIXED_STAGE_PROBABILITIES,
  NUMBERING,
  PERCENT_MAX,
  REQUIRED_TEMPLATE_TAGS,
  STAGE_KEYS,
} from './settings.constants';

export async function getSettingsOrThrow(prisma: PrismaService, projectId: string): Promise<Settings> {
  const settings = await prisma.settings.findUnique({ where: { projectId } });
  if (!settings) throw apiError.notFound('SETTINGS_NOT_FOUND');
  return settings;
}

function asRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Stored identity + patch → always the 8 fields (empty string = not set). */
export function mergeCompany(current: Prisma.JsonValue, patch: CompanyDto): Record<CompanyField, string> {
  const base = asRecord(current);
  const out = {} as Record<CompanyField, string>;
  for (const field of COMPANY_FIELDS) {
    const stored = base[field];
    out[field] = patch[field] ?? (typeof stored === 'string' ? stored : '');
  }
  return out;
}

/**
 * Stored probabilities + patch → always the 7 stages. Unknown stage or non-integer value
 * → INVALID_DATA; WON/LOST with another value than 100/0 → STAGE_PROBABILITY_FIXED (SPEC-10 §2).
 */
export function mergeStageProbabilities(current: Prisma.JsonValue, patch: Record<string, unknown>): Record<string, number> {
  for (const [stage, value] of Object.entries(patch)) {
    if (!STAGE_KEYS.includes(stage)) throw apiError.badRequest('INVALID_DATA');
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > PERCENT_MAX) {
      throw apiError.badRequest('INVALID_DATA');
    }
    if (stage in FIXED_STAGE_PROBABILITIES && value !== FIXED_STAGE_PROBABILITIES[stage]) {
      throw apiError.badRequest('STAGE_PROBABILITY_FIXED');
    }
  }
  const base = asRecord(current);
  const out: Record<string, number> = {};
  for (const stage of STAGE_KEYS) {
    const stored = base[stage];
    out[stage] = (patch[stage] as number | undefined) ?? (typeof stored === 'number' ? stored : DEFAULT_STAGE_PROBABILITIES[stage]);
  }
  return { ...out, ...FIXED_STAGE_PROBABILITIES };
}

export function mapToSettingsResponse(settings: Settings): SettingsResponseDto {
  return {
    vatRate: Number(settings.vatRate),
    revenueTarget: Number(settings.revenueTarget),
    meetingTarget: settings.meetingTarget,
    quoteValidityDays: settings.quoteValidityDays,
    noticeMonths: settings.noticeMonths,
    defaultCommitmentMonths: settings.defaultCommitmentMonths,
    discountCap: settings.discountCap,
    retentionMonths: settings.retentionMonths,
    stageProbabilities: mergeStageProbabilities(settings.stageProbabilities, {}),
    company: mergeCompany(settings.company, {}),
    updatedAt: settings.updatedAt,
  };
}

// ---- templates --------------------------------------------------------------------------

/** Minimal view of the Handlebars AST — enough to walk statements, blocks and their params. */
interface AstNode {
  type: string;
  original?: string;
  path?: AstNode;
  params?: AstNode[];
  body?: AstNode[];
  program?: AstNode;
  inverse?: AstNode;
}

/** Every path referenced by the template: `{{mairie_nom}}`, `{{#each lignes_abo}}` → lignes_abo… */
export function collectTemplateTags(source: string): Set<string> {
  const tags = new Set<string>();
  const visit = (node?: AstNode): void => {
    if (!node) return;
    if (node.type === 'PathExpression' && node.original) tags.add(node.original);
    visit(node.path);
    node.params?.forEach(visit);
    node.body?.forEach(visit);
    visit(node.program);
    visit(node.inverse);
  };
  visit(Handlebars.parse(source) as unknown as AstNode);
  return tags;
}

/** Issues preventing a template from being accepted; empty = valid (SPEC-02 §5.3). */
export function validateTemplate(source: string, type: DocumentTemplateType): string[] {
  let tags: Set<string>;
  try {
    tags = collectTemplateTags(source);
  } catch (error) {
    return [`parse: ${(error as Error).message.split('\n')[0]}`];
  }
  return REQUIRED_TEMPLATE_TAGS[type].filter((tag) => !tags.has(tag)).map((tag) => `missing: ${tag}`);
}

interface TemplateFileRow {
  id: string;
  fileName: string;
  uploadedAt: Date;
  templateType: DocumentTemplateType | null;
}

/** Files sorted by uploadedAt desc → the latest of each type, with its rank as version. */
export function activeTemplates(files: TemplateFileRow[]): TemplateItemDto[] {
  const byType = new Map<DocumentTemplateType, TemplateFileRow[]>();
  for (const file of files) {
    if (!file.templateType) continue;
    const list = byType.get(file.templateType) ?? [];
    list.push(file);
    byType.set(file.templateType, list);
  }
  return Object.values(DocumentTemplateType).flatMap((type) => {
    const list = byType.get(type);
    if (!list?.length) return [];
    const [active] = list;
    return [{ type, version: list.length, fileId: active.id, fileName: active.fileName, uploadedAt: active.uploadedAt }];
  });
}

// ---- numbering (SPEC-01 §4.3) -----------------------------------------------------------

const pad = (n: number, width: number): string => String(n).padStart(width, '0');

export function dayOfYear(date: Date): number {
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 0);
  return Math.floor((date.getTime() - startOfYear) / MS_PER_DAY);
}

/** DEV-{year}-{day of year}-{initials}{daily sequence} — e.g. DEV-2026-241-WB001. */
export function quoteNumber(date: Date, initials: string, sequence: number): string {
  return `${NUMBERING.QUOTE_PREFIX}-${date.getUTCFullYear()}-${pad(dayOfYear(date), NUMBERING.DAY_OF_YEAR_WIDTH)}-${initials}${pad(sequence, NUMBERING.DAILY_SEQUENCE_WIDTH)}`;
}

/** Contract number = quote number with DEV → CTR. */
export function contractNumber(quoteRef: string): string {
  return NUMBERING.CONTRACT_PREFIX + quoteRef.slice(NUMBERING.QUOTE_PREFIX.length);
}

/** FAC-{year}-{yearly sequence on 4} — e.g. FAC-2026-0001. */
export function invoiceNumber(date: Date, sequence: number): string {
  return `${NUMBERING.INVOICE_PREFIX}-${date.getUTCFullYear()}-${pad(sequence, NUMBERING.YEARLY_SEQUENCE_WIDTH)}`;
}

export function numberingExamples(date: Date, initials: string): NumberingExamplesDto {
  const quote = quoteNumber(date, initials, 1);
  return { quote, contract: contractNumber(quote), invoice: invoiceNumber(date, 1) };
}
