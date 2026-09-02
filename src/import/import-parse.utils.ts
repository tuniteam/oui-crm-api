// ============================================
// OUI-CRM - File import: pure parsing rules (US-01-06)
// ============================================

import * as ExcelJS from 'exceljs';
import { AuthenticatedUser } from '@/auth/interfaces/authenticated-user.interface';
import { ImportRowMessageDto, ImportReportDto, ImportResourceTotalsDto } from './dto/import-file.dto';
import { IMPORT_FILE, ImportRowCode } from './import-file.constants';

/** One data row: header-keyed string cells + the Excel row number the report speaks in. */
export interface SheetRow {
  row: number;
  cells: Record<string, string>;
}

/** Sheet-name-keyed rows of an uploaded workbook (a CSV becomes the single GENERIC sheet). */
export type ParsedWorkbook = Map<string, SheetRow[]>;

/**
 * What a profile's `plan()` hands back: the row-by-row report of the simulation, and an
 * `apply` closure over the validated plan — so the orchestrator never sees profile internals.
 */
export interface PreparedImport {
  report: ReportBuilder;
  apply(batchId: string, user: AuthenticatedUser): Promise<void>;
}

/**
 * Reads one worksheet into header-keyed rows. Headers come from row 1 (matched by name, never
 * by position), values are normalized to trimmed strings — the resource parsers own typing.
 * Fully empty rows are skipped, formula cells keep their computed result.
 */
export function sheetToRows(sheet: ExcelJS.Worksheet): SheetRow[] {
  const headers = new Map<number, string>();
  sheet.getRow(1).eachCell((cell, col) => {
    const name = cellText(cell.value).trim();
    if (name) headers.set(col, name);
  });

  const rows: SheetRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const cells: Record<string, string> = {};
    let hasValue = false;
    for (const [col, header] of headers) {
      const text = cellText(row.getCell(col).value).trim();
      cells[header] = text;
      if (text) hasValue = true;
    }
    if (hasValue) rows.push({ row: rowNumber, cells });
  });
  return rows;
}

/** Every cell becomes text; dates as YYYY-MM-DD, rich text flattened, formulas by their result. */
export function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((r) => r.text).join('');
    if ('formula' in value) return cellText((value as ExcelJS.CellFormulaValue).result ?? '');
    if ('text' in value) return String((value as ExcelJS.CellHyperlinkValue).text ?? '');
  }
  return '';
}

/** Minimal CSV reader (comma or semicolon, double-quote escaping) for the single-sheet GENERIC case. */
export function csvToRows(content: string): SheetRow[] {
  const lines = content.replace(/^﻿/, '').split(/\r?\n/);
  const first = lines[0] ?? '';
  const sep = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : ',';
  const parse = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quoted) {
        if (c === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (c === '"') quoted = false;
        else cur += c;
      } else if (c === '"') quoted = true;
      else if (c === sep) {
        out.push(cur);
        cur = '';
      } else cur += c;
    }
    out.push(cur);
    return out;
  };

  const headers = parse(first).map((h) => h.trim());
  const rows: SheetRow[] = [];
  lines.forEach((line, index) => {
    if (index === 0 || !line.trim()) return;
    const values = parse(line);
    const cells: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (h) cells[h] = (values[i] ?? '').trim();
    });
    rows.push({ row: index + 1, cells });
  });
  return rows;
}

/** `tags` / `services` / `regions` / `departments` cells: pipe-separated, blanks dropped. */
export function splitList(cell: string): string[] {
  return cell
    .split(IMPORT_FILE.LIST_SEPARATOR)
    .map((v) => v.trim())
    .filter(Boolean);
}

/** Truthy cell values accepted for boolean columns (isPrimary, optOut, portfolioOnly). */
export function cellBool(cell: string): boolean {
  return ['true', '1', 'yes', 'oui', 'x'].includes(cell.toLowerCase());
}

/**
 * Organization matching key without SIRET (SPEC-05 §5): department + name lowercased,
 * accents stripped, leading "mairie de/d'", "commune de/d'", "ville de/d'" removed,
 * spaces collapsed. `Mairie d'Avesnes-en-Val` and `Avesnes-en-Val` are the same record.
 */
export function normalizeOrgKey(department: string, name: string): string {
  const flat = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^\s*(mairie|commune|ville)\s+(de\s+|d')?/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return `${department}::${flat}`;
}

/** Accumulates rows into the report shape; totals are derived, never counted twice. */
export class ReportBuilder {
  private readonly resources = new Map<string, ImportResourceTotalsDto>();
  readonly errors: ImportRowMessageDto[] = [];
  readonly warnings: ImportRowMessageDto[] = [];

  private resource(name: string): ImportResourceTotalsDto {
    let r = this.resources.get(name);
    if (!r) {
      r = { resource: name, created: 0, updated: 0, skipped: 0 };
      this.resources.set(name, r);
    }
    return r;
  }

  created(resource: string): void {
    this.resource(resource).created++;
  }
  updated(resource: string): void {
    this.resource(resource).updated++;
  }
  skipped(resource: string): void {
    this.resource(resource).skipped++;
  }
  error(sheet: string, row: number, code: ImportRowCode, message: string, field?: string): void {
    this.errors.push({ sheet, row, code, message, ...(field ? { field } : {}) });
  }
  warn(sheet: string, row: number, code: ImportRowCode, message: string, field?: string): void {
    this.warnings.push({ sheet, row, code, message, ...(field ? { field } : {}) });
  }

  build(dryRun: boolean, batchId?: string): ImportReportDto {
    const resources = [...this.resources.values()];
    return {
      dryRun,
      ok: this.errors.length === 0,
      ...(batchId ? { batchId } : {}),
      totals: {
        created: resources.reduce((n, r) => n + r.created, 0),
        updated: resources.reduce((n, r) => n + r.updated, 0),
        skipped: resources.reduce((n, r) => n + r.skipped, 0),
        errors: this.errors.length,
        warnings: this.warnings.length,
      },
      resources,
      errors: this.errors,
      warnings: this.warnings,
    };
  }
}
