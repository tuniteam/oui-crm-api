import { MIME } from '@/common/constants/mime.constants';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { APP_ENV, DEFAULT_PLATFORM_NAME } from '@/common/constants/app.constants';
import { formatDateField } from '@/common/utils/date.utils';
import { mergeStageProbabilities } from '@/settings/settings.utils';
import { PrismaService } from '@/prisma/prisma.service';
import { CONFIG_SHEETS } from './projects.constants';

const projectConfigArgs = Prisma.validator<Prisma.ProjectDefaultArgs>()({
  include: {
    settings: true,
    referenceItems: { orderBy: [{ category: 'asc' }, { order: 'asc' }] },
    scopes: { orderBy: { name: 'asc' } },
    userRoleProjects: {
      orderBy: { initials: 'asc' },
      include: { user: true, role: true, scope: true },
    },
  },
});
type ProjectConfig = Prisma.ProjectGetPayload<typeof projectConfigArgs>;

/**
 * SPEC-10 §4 — XLSX export of a project configuration, one sheet per category, in the layout of
 * the PROJECT_CONFIG import template (Settings, StageProbabilities, ReferenceItems, Scopes, Users)
 * so a configuration can be archived or replayed on another project.
 */
@Injectable()
export class ProjectConfigExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async export(projectId: string): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const project = await this.prisma.project.findFirstOrThrow({ where: { id: projectId }, ...projectConfigArgs });
    const workbook = buildConfigWorkbook(project, this.config.get<string>(APP_ENV.PLATFORM_NAME) || DEFAULT_PLATFORM_NAME);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const day = formatDateField(new Date());
    return { buffer, filename: `${project.slug}-config-${day}.xlsx`, contentType: MIME.XLSX };
  }
}

export function buildConfigWorkbook(project: ProjectConfig, creator: string): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = creator;

  const settings = workbook.addWorksheet(CONFIG_SHEETS.settings);
  settings.columns = [
    { header: 'key', key: 'key', width: 28 },
    { header: 'value', key: 'value', width: 40 },
  ];
  settings.addRows([
    { key: 'slug', value: project.slug },
    { key: 'name', value: project.name },
    { key: 'productName', value: project.productName },
    { key: 'description', value: project.description ?? '' },
  ]);
  if (project.settings) {
    const s = project.settings;
    settings.addRows([
      { key: 'vatRate', value: Number(s.vatRate) },
      { key: 'revenueTarget', value: Number(s.revenueTarget) },
      { key: 'meetingTarget', value: s.meetingTarget },
      { key: 'quoteValidityDays', value: s.quoteValidityDays },
      { key: 'noticeMonths', value: s.noticeMonths },
      { key: 'defaultCommitmentMonths', value: s.defaultCommitmentMonths },
      { key: 'discountCap', value: s.discountCap },
      { key: 'retentionMonths', value: s.retentionMonths },
    ]);
    const company = (s.company ?? {}) as Record<string, string>;
    settings.addRows(Object.entries(company).map(([k, v]) => ({ key: `company.${k}`, value: v })));
  }

  const probabilities = workbook.addWorksheet(CONFIG_SHEETS.stageProbabilities);
  probabilities.columns = [
    { header: 'stage', key: 'stage', width: 22 },
    { header: 'probability', key: 'probability', width: 14 },
  ];
  // La colonne ne stocke que le patch des étapes qu'un projet redéfinit : l'export passe par le
  // lecteur canonique pour sortir les 7 étapes, comme `GET /settings` les sert.
  const stageProbabilities = mergeStageProbabilities(project.settings?.stageProbabilities ?? {}, {});
  probabilities.addRows(Object.entries(stageProbabilities).map(([stage, probability]) => ({ stage, probability })));

  const references = workbook.addWorksheet(CONFIG_SHEETS.referenceItems);
  references.columns = [
    { header: 'category', key: 'category', width: 20 },
    { header: 'key', key: 'key', width: 24 },
    { header: 'label', key: 'label', width: 40 },
    { header: 'order', key: 'order', width: 8 },
    { header: 'active', key: 'active', width: 8 },
    { header: 'metadata', key: 'metadata', width: 40 },
  ];
  references.addRows(
    project.referenceItems.map((item) => ({
      category: item.category,
      key: item.key,
      label: item.label,
      order: item.order,
      active: item.active,
      metadata: JSON.stringify(item.metadata ?? {}),
    })),
  );

  const scopes = workbook.addWorksheet(CONFIG_SHEETS.scopes);
  scopes.columns = [
    { header: 'name', key: 'name', width: 30 },
    { header: 'description', key: 'description', width: 40 },
    { header: 'regions', key: 'regions', width: 30 },
    { header: 'departments', key: 'departments', width: 30 },
    { header: 'portfolioOnly', key: 'portfolioOnly', width: 12 },
    { header: 'nature', key: 'nature', width: 12 },
  ];
  scopes.addRows(
    project.scopes.map((s) => ({
      name: s.name,
      description: s.description,
      regions: s.regions.join(', '),
      departments: s.departments.join(', '),
      portfolioOnly: s.portfolioOnly,
      nature: s.nature,
    })),
  );

  const users = workbook.addWorksheet(CONFIG_SHEETS.users);
  users.columns = [
    { header: 'email', key: 'email', width: 36 },
    { header: 'firstName', key: 'firstName', width: 16 },
    { header: 'lastName', key: 'lastName', width: 16 },
    { header: 'role', key: 'role', width: 22 },
    { header: 'scope', key: 'scope', width: 30 },
    { header: 'initials', key: 'initials', width: 8 },
    { header: 'expiresAt', key: 'expiresAt', width: 12 },
    { header: 'status', key: 'status', width: 10 },
  ];
  users.addRows(
    project.userRoleProjects.map((urp) => ({
      email: urp.user.email,
      firstName: urp.user.firstName,
      lastName: urp.user.lastName,
      role: urp.role.code,
      scope: urp.scope?.name ?? '',
      initials: urp.initials,
      expiresAt: urp.expiresAt ? formatDateField(urp.expiresAt) : '',
      status: urp.status,
    })),
  );

  workbook.eachSheet((sheet) => {
    sheet.getRow(1).font = { bold: true };
  });
  return workbook;
}
