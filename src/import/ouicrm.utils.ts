// ============================================
// OUI-CRM - OUICRM_V2_1 takeover: pure rules (SPEC-05 §2-5)
// ============================================

import * as ExcelJS from 'exceljs';
import { Priority, SalesStatus } from '@prisma/client';
import {
  CONTACT_PATTERN,
  ETIQUETTE_MAP,
  LEADS_COLUMNS,
  LEAD_STATUS_MAP,
  OUICRM,
  PHONE_PATTERN,
  SOURCE_MAP,
  TYPE_PREFIXES,
} from './ouicrm.constants';
import { cellText } from './import-parse.utils';

/** One Leads row, positional (SPEC-05 §2.1), with its Excel row number. */
export interface LeadRow {
  row: number;
  dept: string;
  name: string;
  source: string;
  etiquette: string;
  editor: string;
  status: string;
  comment: string;
  meetingDate: string; // YYYY-MM-DD or ''
  comment2: string;
}

/** Sheet names and cell values are compared after dropping emojis/symbols and tidying spaces. */
export function stripDecorations(value: string): string {
  return value
    .replace(/[\p{Extended_Pictographic}️‍]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function canonical(value: string): string {
  return stripDecorations(value).toUpperCase();
}

/** Finds a workbook sheet by canonical name ("LEADS" matches "🎯 Leads"). */
export function findSheet(workbook: ExcelJS.Workbook, canonicalName: string): ExcelJS.Worksheet | undefined {
  let found: ExcelJS.Worksheet | undefined;
  workbook.eachSheet((sheet) => {
    if (canonical(sheet.name) === canonicalName) found = sheet;
  });
  return found;
}

/** Reads the Leads sheet positionally from row 7; rows without a collectivity name are ignored (§1). */
export function readLeadRows(sheet: ExcelJS.Worksheet): LeadRow[] {
  const rows: LeadRow[] = [];
  for (let r = OUICRM.LEADS_DATA_START; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const cell = (col: number): string => cellText(row.getCell(col).value).trim();
    const name = cell(LEADS_COLUMNS.NAME);
    if (!name) continue;
    rows.push({
      row: r,
      dept: cell(LEADS_COLUMNS.DEPT),
      name: name.replace(/\s+/g, ' '),
      source: cell(LEADS_COLUMNS.SOURCE),
      etiquette: cell(LEADS_COLUMNS.ETIQUETTE),
      editor: cell(LEADS_COLUMNS.EDITOR),
      status: cell(LEADS_COLUMNS.STATUS),
      comment: cell(LEADS_COLUMNS.COMMENT),
      meetingDate: cell(LEADS_COLUMNS.MEETING_DATE),
      comment2: cell(LEADS_COLUMNS.COMMENT_2),
    });
  }
  return rows;
}

/** §2.1 A — '1' → '01'; 2A/2B accepted upstream through the shared department list. */
export function padDepartment(dept: string): string {
  return dept.length === 1 ? `0${dept}` : dept;
}

/** §2.1 B — structure type from the name's prefix; null means "COMMUNE, but warn". */
export function deduceType(name: string): string | null {
  for (const { pattern, type } of TYPE_PREFIXES) if (pattern.test(name)) return type;
  return null;
}

/** §3.1 — empty status is a lead to contact. */
export function mapLeadStatus(status: string): SalesStatus | undefined {
  if (!status) return SalesStatus.TO_CONTACT;
  return LEAD_STATUS_MAP[canonical(status)];
}

/** Q2 — étiquette → priority (+ HOT tag for Chaud); empty → NORMAL. */
export function mapEtiquette(etiquette: string): { priority: Priority; tag?: string } | undefined {
  if (!etiquette) return { priority: Priority.NORMAL };
  return ETIQUETTE_MAP[canonical(etiquette)];
}

/** §3.3 — composite cells ("A | B") take the first mapped value; `composite` asks for a warning. */
export function mapSource(source: string): { key: string | null; composite: boolean } {
  if (!source) return { key: null, composite: false };
  const parts = source
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
  const first = parts[0] ?? '';
  return { key: SOURCE_MAP[canonical(first)] ?? null, composite: parts.length > 1 };
}

/**
 * §4 — best-effort contact from the comment: civility + UPPERCASE name before a colon,
 * first phone-looking sequence normalized in pairs. No match → no contact, a warning.
 */
export function extractContact(
  comment: string,
): { civility: string; lastName: string; phone: string | null } | null {
  const match = CONTACT_PATTERN.exec(comment);
  if (!match) return null;
  const lastName = match[2]
    .trim()
    .toLowerCase()
    .replace(/(^|[\s'-])([a-zà-ÿ])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
  const phoneMatch = PHONE_PATTERN.exec(comment);
  const phone = phoneMatch ? normalizePhone(phoneMatch[0]) : null;
  return { civility: match[1], lastName, phone };
}

/** '0235342401' / '+33 2 35 34 24 01' → '02 35 34 24 01' (§4.2). */
export function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('33')) digits = `0${digits.slice(2)}`;
  return digits.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
}

/** §5 — Levenshtein distance, bounded: anything beyond `max` answers max + 1 quickly. */
export function levenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = new Array<number>(b.length + 1);
  const cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

/**
 * Entry A — scans the ⚙️ Paramètres sheet for its blocks (SPEC-10 §3.3): a known header cell
 * (emoji stripped, case-insensitive) opens a block, its values are the non-empty cells below
 * it in the same column, until the first empty cell. Blocks live on several bands (rows 4 and
 * 20 in the real workbook). Cells sharing a band row with known headers but matching none are
 * reported as unknown blocks — a warning, never an error.
 */
export function scanParamBlocks(
  sheet: ExcelJS.Worksheet,
  knownBlocks: readonly string[],
): { blocks: Map<string, string[]>; unknown: string[] } {
  const known = new Set(knownBlocks);
  const readDown = (row: number, col: number): string[] => {
    const values: string[] = [];
    for (let r = row + 1; r <= sheet.rowCount; r++) {
      const v = cellText(sheet.getRow(r).getCell(col).value).trim();
      if (!v) break;
      values.push(v);
    }
    return values;
  };

  const blocks = new Map<string, string[]>();
  const headerCells: { row: number; col: number; name: string }[] = [];
  const bandRows = new Set<number>();
  sheet.eachRow((row, rowNumber) => {
    row.eachCell((cell, col) => {
      const name = canonical(cellText(cell.value));
      if (!name) return;
      headerCells.push({ row: rowNumber, col, name });
      if (known.has(name)) bandRows.add(rowNumber);
    });
  });

  const unknown: string[] = [];
  for (const cell of headerCells) {
    if (!bandRows.has(cell.row)) continue; // only band rows carry headers
    if (known.has(cell.name)) {
      if (!blocks.has(cell.name)) blocks.set(cell.name, readDown(cell.row, cell.col));
    } else if (readDown(cell.row, cell.col).length && !unknown.includes(cell.name)) {
      unknown.push(cell.name);
    }
  }
  return { blocks, unknown };
}
