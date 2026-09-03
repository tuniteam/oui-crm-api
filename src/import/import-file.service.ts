import { Injectable, Logger } from '@nestjs/common';
import { FileCategory, FileOwnerType, ImportProfile } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { AuthenticatedUser } from '@/auth/interfaces/authenticated-user.interface';
import { findPermission } from '@/auth/utils/permissions.util';
import { AuditLogService } from '@/audit-log/audit-log.service';
import { AUDIT_OBJECTS } from '@/audit-log/audit-log.constants';
import { apiError } from '@/common/api-error';
import { MIME } from '@/common/constants/mime.constants';
import { FileService } from '@/files/file.service';
import { UploadedFileLike } from '@/files/uploaded-file.interface';
import { ProjectConfigExportService } from '@/projects/project-config-export.service';
import { PrismaService } from '@/prisma/prisma.service';
import { ImportFileQueryDto, ImportReportDto } from './dto/import-file.dto';
import { GenericImportService } from './generic-import.service';
import { OuicrmImportService } from './ouicrm-import.service';
import { ProjectConfigImportService } from './project-config-import.service';
import { stampAppliedAt } from './import.constants';
import { IMPORT_AUDIT } from './import.constants';
import {
  GENERIC_CONTACT_HEADERS,
  GENERIC_ORGANIZATION_HEADERS,
  GENERIC_SHEETS,
  IMPORT_FILE,
} from './import-file.constants';
import { ParsedWorkbook, csvToRows, sheetToRows } from './import-parse.utils';

/**
 * US-01-06 — one import framework, per-profile resources (SPEC-03 §2.11): explicit dryRun,
 * a row-by-row report speaking in Excel row numbers, a cancellable batch, the source file
 * attached to the batch. The permission depends on the profile: GENERIC belongs to the
 * commercial base (organizations:import), PROJECT_CONFIG to the configuration
 * (settings:update + references:update + scopes:update) — asserted here, not in the guard.
 */
@Injectable()
export class ImportFileService {
  private readonly logger = new Logger(ImportFileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly files: FileService,
    private readonly configExport: ProjectConfigExportService,
    private readonly generic: GenericImportService,
    private readonly projectConfig: ProjectConfigImportService,
    private readonly ouicrm: OuicrmImportService,
  ) {}

  // ------------------------------------------------------------------------------ template

  async template(
    projectId: string,
    profile: ImportProfile,
    user: AuthenticatedUser,
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    this.assertProfileAllowed(projectId, profile, user);
    // The takeover profile has no template: the workbook itself is the source (D2)
    if (profile === ImportProfile.OUICRM_V2_1) throw apiError.badRequest('INVALID_DATA');
    if (profile === ImportProfile.PROJECT_CONFIG) {
      // The template IS the export of the current configuration (SPEC-10 §4): same sheets,
      // pre-filled — edit and replay.
      return this.configExport.export(projectId);
    }
    const workbook = new ExcelJS.Workbook();
    const organizations = workbook.addWorksheet(GENERIC_SHEETS.organizations);
    organizations.columns = GENERIC_ORGANIZATION_HEADERS.map((h) => ({ header: h, key: h, width: 18 }));
    organizations.addRow({
      name: 'Commune de Joigny',
      type: 'COMMUNE',
      department: '89',
      postalCode: '89300',
      city: 'Joigny',
      population: 9550,
      tags: 'HOT',
      priority: 'HIGH',
    });
    const contacts = workbook.addWorksheet(GENERIC_SHEETS.contacts);
    contacts.columns = GENERIC_CONTACT_HEADERS.map((h) => ({ header: h, key: h, width: 18 }));
    contacts.addRow({
      organization: 'Commune de Joigny',
      department: '89',
      civility: 'Mme',
      firstName: 'Marie',
      lastName: 'Durand',
      role: 'DGS',
      email: 'm.durand@joigny.fr',
      isPrimary: 'true',
    });
    workbook.eachSheet((sheet) => {
      sheet.getRow(1).font = { bold: true };
    });
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return { buffer, filename: 'oui-crm-import-generic.xlsx', contentType: MIME.XLSX };
  }

  // ------------------------------------------------------------------------------ run

  async run(
    projectId: string,
    query: ImportFileQueryDto,
    file: UploadedFileLike | undefined,
    user: AuthenticatedUser,
  ): Promise<ImportReportDto> {
    const profile = query.profile;
    const dryRun = query.dryRun === 'true';
    this.assertProfileAllowed(projectId, profile, user);
    if (!file?.buffer?.length) throw apiError.badRequest('INVALID_DATA');

    const { sheets, workbook } = await this.parse(profile, file);
    // The takeover workbook is capped on its data rows by its own reader (KPI bands, huge
    // formatted-but-empty ranges); the header-keyed profiles are capped here
    if (profile !== ImportProfile.OUICRM_V2_1) {
      const rowCount = [...sheets.values()].reduce((n, rows) => n + rows.length, 0);
      if (rowCount > IMPORT_FILE.MAX_ROWS) throw apiError.payloadTooLarge('IMPORT_TOO_MANY_ROWS', IMPORT_FILE.MAX_ROWS);
    }

    const prepared =
      profile === ImportProfile.OUICRM_V2_1
        ? await this.ouicrm.plan(projectId, workbook!)
        : profile === ImportProfile.GENERIC
          ? await this.generic.plan(projectId, sheets)
          : await this.projectConfig.plan(projectId, sheets, workbook);
    if (dryRun) return prepared.report.build(true);

    const batch = await this.prisma.importBatch.create({
      data: { projectId, profile, status: 'APPLIED', totals: {}, createdBy: user.id },
      select: { id: true },
    });
    try {
      await prepared.apply(batch.id, user);
    } catch (err) {
      // Never strand an APPLIED batch that owns nothing (closure review L1)
      await this.prisma.importBatch.delete({ where: { id: batch.id } }).catch(() => undefined);
      throw err;
    }

    const report = prepared.report.build(false, batch.id);
    // Horodaté APRÈS les écritures : tout ce qui touche une ligne du lot ensuite est une
    // modification, et l'annulation le verra sans dépendre d'un chronomètre.
    await this.prisma.importBatch.update({
      where: { id: batch.id },
      data: { totals: stampAppliedAt({ ...report.totals }) },
    });
    await this.audit.log(this.prisma, {
      projectId,
      userId: user.id,
      action: IMPORT_AUDIT.RUN,
      objectType: AUDIT_OBJECTS.IMPORT_BATCH,
      objectId: batch.id,
      metadata: { profile, fileName: file.originalname, ...report.totals },
    });
    await this.attachSourceFile(projectId, batch.id, file, user);
    return report;
  }

  /** The source file is owned by its batch (files registry, hook left by L0) — best effort. */
  private async attachSourceFile(
    projectId: string,
    batchId: string,
    file: UploadedFileLike,
    user: AuthenticatedUser,
  ): Promise<void> {
    // curl & friends declare octet-stream: worthless for validation — let the magic bytes
    // speak (XLSX), and derive text/csv from the name (plain text has no magic bytes)
    const declaredMimeType = file.originalname.toLowerCase().endsWith('.csv')
      ? MIME.CSV
      : file.mimetype && file.mimetype !== 'application/octet-stream'
        ? file.mimetype
        : undefined;
    try {
      await this.files.upload({
        projectId,
        ownerType: FileOwnerType.IMPORT_BATCH,
        ownerId: batchId,
        category: FileCategory.IMPORT_SOURCE,
        buffer: file.buffer,
        fileName: file.originalname,
        declaredMimeType,
        uploadedBy: user.id,
      });
    } catch (err) {
      // The import stands even if the archive copy fails (storage down): report it, don't undo it
      this.logger.warn(`Import source file not archived for batch ${batchId}: ${(err as Error).message}`);
    }
  }

  // ------------------------------------------------------------------------------ helpers

  private async parse(
    profile: ImportProfile,
    file: UploadedFileLike,
  ): Promise<{ sheets: ParsedWorkbook; workbook: ExcelJS.Workbook | null }> {
    const isCsv = file.originalname.toLowerCase().endsWith('.csv') || file.mimetype === MIME.CSV;
    if (isCsv) {
      // A CSV is a single table: only the GENERIC organizations sheet fits in one
      if (profile !== ImportProfile.GENERIC) throw apiError.badRequest('INVALID_DATA');
      return { sheets: new Map([[GENERIC_SHEETS.organizations, csvToRows(file.buffer.toString('utf8'))]]), workbook: null };
    }
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(file.buffer as unknown as ArrayBuffer);
    } catch {
      throw apiError.badRequest('INVALID_DATA');
    }
    const sheets: ParsedWorkbook = new Map();
    workbook.eachSheet((sheet) => sheets.set(sheet.name, sheetToRows(sheet)));
    return { sheets, workbook };
  }

  /** GENERIC = commercial base; PROJECT_CONFIG = configuration (all three permissions). */
  private assertProfileAllowed(projectId: string, profile: ImportProfile, user: AuthenticatedUser): void {
    // Exhaustive on purpose: an unlisted profile must fail loudly, never inherit a permission
    const PROFILE_PERMISSIONS: Record<string, string[]> = {
      [ImportProfile.GENERIC]: ['organizations:import'],
      [ImportProfile.OUICRM_V2_1]: ['organizations:import'],
      [ImportProfile.PROJECT_CONFIG]: ['settings:update', 'references:update', 'scopes:update'],
    };
    const required = PROFILE_PERMISSIONS[profile];
    if (!required) throw apiError.badRequest('IMPORT_PROFILE_UNSUPPORTED', profile);
    for (const code of required) {
      if (!findPermission(user, projectId, code)) throw apiError.forbidden('ACCESS_DENIED');
    }
  }
}
