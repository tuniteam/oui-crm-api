import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { AuthenticatedUser } from '@/auth/interfaces/authenticated-user.interface';
import { AuditLogService } from '@/audit-log/audit-log.service';
import { AUDIT_OBJECTS } from '@/audit-log/audit-log.constants';
import { apiError } from '@/common/api-error';
import { MIME } from '@/common/constants/mime.constants';
import { formatDateField } from '@/common/utils/date.utils';
import { ORGANIZATION_REFS } from '@/organizations/organizations.mapper';
import { buildOrganizationWhere, loadActiveBrackets } from '@/organizations/organizations.utils';
import { BulkFiltersDto } from '@/organizations/dto';
import { ScopeService } from '@/scopes/scope.service';
import { hydrateCampaignMembership, loadScopeContext, mergeVisibilityWhere } from '@/scopes/scopes.utils';
import { PrismaService } from '@/prisma/prisma.service';
import { ExportOrganizationsDto } from './dto/export-organizations.dto';
import { EXPORT_AUDIT, EXPORT_COLUMNS, EXPORT_MAX_ROWS, ExportColumnKey } from './exports.constants';
import { buildExportRow, toCsv } from './exports.utils';

/**
 * US-01-07 — the filtered list as a file. SYNCHRONOUS at L1 (no job engine yet — decision of
 * 01/09/2026): beyond EXPORT_MAX_ROWS the request is refused (413) and the front invites the
 * user to narrow the filters; the contract's 202 { jobId } is simply never emitted before L2.
 * Same visibility rules as the list: NONE-hidden records are absent, RESTRICTED rows only
 * carry the restricted columns. Journalled with the volume — a commercial file leaves the
 * company.
 */
@Injectable()
export class ExportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: ScopeService,
    private readonly audit: AuditLogService,
  ) {}

  async organizationsList(
    projectId: string,
    dto: ExportOrganizationsDto,
    user: AuthenticatedUser,
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const ctx = await loadScopeContext(this.prisma, user, projectId);
    const where: Prisma.OrganizationWhereInput = buildOrganizationWhere(projectId, (dto.filters ?? {}) as BulkFiltersDto);
    mergeVisibilityWhere(where, ctx, this.scopeService);

    const total = await this.prisma.organization.count({ where });
    if (total > EXPORT_MAX_ROWS) throw apiError.payloadTooLarge('EXPORT_TOO_LARGE', EXPORT_MAX_ROWS);

    const [rows, brackets] = await Promise.all([
      this.prisma.organization.findMany({ where, orderBy: { name: 'asc' }, include: ORGANIZATION_REFS }),
      loadActiveBrackets(this.prisma, projectId),
    ]);
    await hydrateCampaignMembership(this.prisma, ctx, rows);

    const keys: readonly ExportColumnKey[] = dto.columns?.length
      ? dto.columns
      : EXPORT_COLUMNS.map((c) => c.key);
    const headers = keys.map((key) => EXPORT_COLUMNS.find((c) => c.key === key)!.header);
    const cells = rows.map((row) => buildExportRow(row, this.scopeService.access(ctx, row), brackets, keys));

    const slugPart = await this.filenameSlug(projectId);
    const dayPart = formatDateField(new Date());
    const file =
      dto.format === 'CSV'
        ? {
            buffer: Buffer.from(toCsv(headers, cells), 'utf8'),
            filename: `${slugPart}-organismes-${dayPart}.csv`,
            contentType: MIME.CSV,
          }
        : {
            buffer: await this.toXlsx(headers, cells),
            filename: `${slugPart}-organismes-${dayPart}.xlsx`,
            contentType: MIME.XLSX,
          };

    await this.audit.logNow({
      projectId,
      userId: user.id,
      action: EXPORT_AUDIT.ORGANIZATIONS,
      objectType: AUDIT_OBJECTS.ORGANIZATION,
      metadata: {
        format: dto.format,
        rows: rows.length,
        columns: keys as string[],
        ...(dto.filters && Object.keys(dto.filters).length ? { filters: dto.filters as Prisma.InputJsonValue } : {}),
      },
    });
    return file;
  }

  private async toXlsx(headers: readonly string[], cells: readonly (readonly string[])[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Organismes');
    sheet.addRow([...headers]);
    sheet.getRow(1).font = { bold: true };
    for (const row of cells) sheet.addRow([...row]);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private async filenameSlug(projectId: string): Promise<string> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { slug: true } });
    return project?.slug ?? 'projet';
  }
}
