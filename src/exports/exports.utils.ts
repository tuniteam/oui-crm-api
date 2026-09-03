// ============================================
// OUI-CRM - Organization export: pure builders (US-01-07)
// ============================================

import { ScopeAccess } from '@/scopes/scope.service';
import { OrganizationWithRefs } from '@/organizations/organizations.mapper';
import { PopulationBracket, resolveBracketLabel } from '@/organizations/organizations.utils';
import { fullName } from '@/common/utils/user.utils';
import { CSV_BOM, CSV_SEPARATOR, EXPORT_COLUMNS, ExportColumnKey } from './exports.constants';

const day = (value: Date | null): string => (value ? value.toISOString().slice(0, 10) : '');

/** One cell per column; a RESTRICTED row only fills the restricted subset (US-01-01). */
export function buildExportRow(
  row: OrganizationWithRefs,
  access: ScopeAccess,
  brackets: PopulationBracket[],
  keys: readonly ExportColumnKey[],
): string[] {
  const values: Record<ExportColumnKey, string> = {
    name: row.name,
    type: row.type,
    department: row.department,
    city: row.city ?? '',
    postalCode: row.postalCode ?? '',
    address: row.address ?? '',
    siret: row.siret ?? '',
    inseeCode: row.inseeCode ?? '',
    population: row.population === null ? '' : String(row.population),
    bracketLabel: resolveBracketLabel(brackets, row.population) ?? '',
    epci: row.epci ?? '',
    salesStatus: row.salesStatus,
    customerStatus: row.customerStatus,
    priority: row.priority,
    tags: row.tags.join(' | '),
    solution: row.solution ?? '',
    leadSource: row.leadSource ?? '',
    salesRep: row.salesRep ? fullName(row.salesRep) : '',
    email: row.email ?? '',
    phone: row.phone ?? '',
    website: row.website ?? '',
    schoolCount: row.schoolCount === null ? '' : String(row.schoolCount),
    childCount: row.childCount === null ? '' : String(row.childCount),
    services: row.services.join(' | '),
    completenessScore: String(row.completenessScore),
    lastActivityAt: day(row.lastActivityAt),
    nextActivityAt: day(row.nextActivityAt),
    createdAt: day(row.createdAt),
  };
  const restricted = new Set<ExportColumnKey>(EXPORT_COLUMNS.filter((c) => c.restricted).map((c) => c.key));
  return keys.map((key) => (access === 'FULL' || restricted.has(key) ? values[key] : ''));
}

/** `;`-separated, UTF-8 with BOM (French Excel), quotes doubled, one line per row. */
export function toCsv(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const escape = (cell: string): string =>
    /[";\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
  const lines = [headers, ...rows].map((cells) => cells.map(escape).join(CSV_SEPARATOR));
  return CSV_BOM + lines.join('\r\n') + '\r\n';
}
