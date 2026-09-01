import { ProjectStatus } from '@prisma/client';
import { MIME } from '@/common/constants/mime.constants';

/** Audit actions written by the projects module (SPEC-02 §4.3). */
export const PROJECT_AUDIT = {
  CREATE: 'project.create',
  UPDATE: 'project.update',
  FEATURES_UPDATE: 'project.features.update',
  ACTIVATE: 'project.activate',
  ARCHIVE: 'project.archive',
  RESTORE: 'project.restore',
  CONFIG_EXPORT: 'project.config.export',
} as const;

/** Allowed status transitions (POST /projects/:id/status) and the audit action of each one. */
export const PROJECT_TRANSITIONS: Record<ProjectStatus, Partial<Record<ProjectStatus, string>>> = {
  [ProjectStatus.DRAFT]: { [ProjectStatus.ACTIVE]: PROJECT_AUDIT.ACTIVATE },
  [ProjectStatus.ACTIVE]: { [ProjectStatus.ARCHIVED]: PROJECT_AUDIT.ARCHIVE },
  [ProjectStatus.ARCHIVED]: { [ProjectStatus.ACTIVE]: PROJECT_AUDIT.RESTORE },
};

/** Target statuses a caller may request (DRAFT is only ever the initial status). */
export const PROJECT_TARGET_STATUSES: ProjectStatus[] = [ProjectStatus.ACTIVE, ProjectStatus.ARCHIVED];

/** Slug: lowercase letters, digits and single dashes — used in URLs and export file names. */
export const PROJECT_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const PROJECT_SLUG_MIN = 2;
export const PROJECT_SLUG_MAX = 50;
export const PROJECT_NAME_MAX_LENGTH = 100;
export const PROJECT_DESCRIPTION_MAX_LENGTH = 1000;

/** Sheet names of the configuration workbook (same as the PROJECT_CONFIG import template, SPEC-10 §3.3). */
export const CONFIG_SHEETS = {
  settings: 'Settings',
  stageProbabilities: 'StageProbabilities',
  referenceItems: 'ReferenceItems',
  scopes: 'Scopes',
  users: 'Users',
} as const;

