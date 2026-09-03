import { Injectable } from '@nestjs/common';
import { ActivityStatus, Prisma, Priority, RelationshipStatus, SalesStatus } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { AuthenticatedUser } from '@/auth/interfaces/authenticated-user.interface';
import { apiError } from '@/common/api-error';
import { DAY_PATTERN } from '@/common/utils/date.utils';
import { recomputeActivityMarks } from '@/activities/activities.utils';
import { completenessScore, recomputeCompleteness } from '@/organizations/organizations.utils';
import { REFERENCE_CATEGORIES } from '@/common/messages';
import { PrismaService } from '@/prisma/prisma.service';
import { IMPORT_FILE, IMPORT_RESOURCES, IMPORT_ROW_CODES } from './import-file.constants';
import { PreparedImport, ReportBuilder, loadReferenceKeys, normalizeOrgKey } from './import-parse.utils';
import { EDITOR_MAP, OUICRM } from './ouicrm.constants';
import {
  LeadRow,
  canonical,
  deduceType,
  extractContact,
  findSheet,
  levenshtein,
  mapEtiquette,
  mapLeadStatus,
  mapSource,
  padDepartment,
  readLeadRows,
} from './ouicrm.utils';
import { KNOWN_DEPARTMENTS } from './territory.utils';

const APPLY_TIMEOUT_MS = 60_000;
const LEADS = '🎯 Leads';
/** §5 — both comments travel in the report when a lead is duplicated; keep them readable. */
const COMMENT_EXCERPT = 120;

interface OrgPlan {
  key: string;
  data: Prisma.OrganizationCreateManyInput;
}
interface OrgUpdate {
  id: string;
  data: Prisma.OrganizationUncheckedUpdateInput;
}
interface ContactPlan {
  orgKey: string;
  orgId: string | null;
  data: Omit<Prisma.ContactCreateManyInput, 'organizationId' | 'projectId'>;
}
interface ActivityPlan {
  orgKey: string;
  orgId: string | null;
  contactKey: string | null; // orgKey of the extracted contact carrying the note
  data: Omit<Prisma.ActivityCreateManyInput, 'organizationId' | 'projectId' | 'contactId'>;
}

/**
 * OUICRM_V2_1 — takeover of the real workbook (decision D2: docs/OUICRM_v2_1.xlsx, 14/08/2026).
 * L1 imports the 🎯 Leads sheet (organizations, best-effort contacts, meeting & note
 * activities — SPEC-05 §2.1/§4); the 📋 Pipeline sheet carries opportunities and quotes and
 * is deferred to L2 with a warning. Defaults: sales rep = Wiem Bousaid (Q1), étiquette →
 * priority + HOT tag (Q2). Re-running fills empty fields only, never overwrites (§5).
 */
@Injectable()
export class OuicrmImportService {
  constructor(private readonly prisma: PrismaService) {}

  async plan(projectId: string, workbook: ExcelJS.Workbook): Promise<PreparedImport> {
    const report = new ReportBuilder();
    const leadsSheet = findSheet(workbook, OUICRM.LEADS_SHEET);
    if (!leadsSheet) throw apiError.badRequest('INVALID_DATA');
    if (findSheet(workbook, OUICRM.PIPELINE_SHEET)) {
      report.warn(
        OUICRM.PIPELINE_SHEET,
        1,
        IMPORT_ROW_CODES.SHEET_DEFERRED,
        'The pipeline sheet carries opportunities and quotes — imported with lot L2, nothing lost',
      );
    }

    const leadRows = readLeadRows(leadsSheet);
    if (leadRows.length > IMPORT_FILE.MAX_ROWS) {
      throw apiError.payloadTooLarge('IMPORT_TOO_MANY_ROWS', IMPORT_FILE.MAX_ROWS);
    }

    const [refs, defaultRep, existing, primaries, existingContacts, existingActivities] = await Promise.all([
      loadReferenceKeys(this.prisma, projectId, [REFERENCE_CATEGORIES.STRUCTURE_TYPE, REFERENCE_CATEGORIES.TAG]),
      this.prisma.userRoleProject.findFirst({
        where: { projectId, initials: OUICRM.DEFAULT_REP_INITIALS, status: RelationshipStatus.ACTIVE },
        select: { userId: true },
      }),
      this.prisma.organization.findMany({
        where: { projectId, deletedAt: null },
        select: {
          id: true,
          name: true,
          department: true,
          solution: true,
          leadSource: true,
          salesRepId: true,
          notes: true,
          tags: true,
        },
      }),
      this.prisma.contact.findMany({
        where: { projectId, deletedAt: null, isPrimary: true },
        select: { organizationId: true },
      }),
      this.prisma.contact.findMany({
        where: { projectId, deletedAt: null },
        select: { organizationId: true, lastName: true },
      }),
      this.prisma.activity.findMany({
        where: { projectId, organization: { deletedAt: null } },
        select: { organizationId: true, type: true, date: true },
      }),
    ]);
    if (!defaultRep) {
      report.warn(LEADS, 1, IMPORT_ROW_CODES.UNKNOWN_SALES_PERSON, `No active member with initials ${OUICRM.DEFAULT_REP_INITIALS} — records land unassigned, without activities`);
    }

    const primaryOrgIds = new Set(primaries.map((c) => c.organizationId));
    const byKey = new Map(existing.map((o) => [normalizeOrgKey(o.department, o.name), o]));
    const contactKeys = new Set(existingContacts.map((c) => `${c.organizationId}::${c.lastName.toLowerCase()}`));
    const activityKeys = new Set(
      existingActivities.map((a) => `${a.organizationId}::${a.type}::${a.date.toISOString().slice(0, 10)}`),
    );

    const creates: OrgPlan[] = [];
    const updates: OrgUpdate[] = [];
    const contacts: ContactPlan[] = [];
    const activities: ActivityPlan[] = [];
    const seen = new Map<string, LeadRow>(); // key -> first row, for the DUPLICATE_LEAD report
    const today = new Date().toISOString().slice(0, 10);

    for (const lead of leadRows) {
      const department = padDepartment(lead.dept);
      if (!KNOWN_DEPARTMENTS.has(department)) {
        report.error(LEADS, lead.row, IMPORT_ROW_CODES.UNKNOWN_DEPARTMENT, `Department ${lead.dept || '(vide)'} is not a known French department`, 'Dept');
        continue;
      }
      const key = normalizeOrgKey(department, lead.name);
      const first = seen.get(key);
      if (first) {
        report.error(
          LEADS,
          lead.row,
          IMPORT_ROW_CODES.DUPLICATE_LEAD,
          `Same collectivity as row ${first.row} — comments: « ${first.comment.slice(0, COMMENT_EXCERPT)} » / « ${lead.comment.slice(0, COMMENT_EXCERPT)} »`,
        );
        continue;
      }
      seen.set(key, lead);

      const salesStatus = mapLeadStatus(lead.status);
      if (!salesStatus) {
        report.error(LEADS, lead.row, IMPORT_ROW_CODES.INVALID_VALUE, `Statut Prospection « ${lead.status} » is outside the §3.1 table`, 'Statut Prospection');
        continue;
      }
      let type = deduceType(lead.name);
      if (!type) {
        type = 'COMMUNE';
        report.warn(LEADS, lead.row, IMPORT_ROW_CODES.TYPE_DEFAULTED, `No known prefix in « ${lead.name} » — imported as COMMUNE`, 'Commune / Collectivité');
      }
      if (!refs.get(REFERENCE_CATEGORIES.STRUCTURE_TYPE)?.has(type)) {
        report.error(LEADS, lead.row, IMPORT_ROW_CODES.UNKNOWN_REFERENCE, `Structure type ${type} is not in the referential`, 'type');
        continue;
      }
      const etiquette = mapEtiquette(lead.etiquette);
      let priority: Priority = Priority.NORMAL;
      const tags: string[] = [];
      if (!etiquette) {
        report.warn(LEADS, lead.row, IMPORT_ROW_CODES.INVALID_VALUE, `Étiquette « ${lead.etiquette} » unknown — priority left NORMAL`, 'etiquuette');
      } else {
        priority = etiquette.priority;
        if (etiquette.tag && refs.get(REFERENCE_CATEGORIES.TAG)?.has(etiquette.tag)) tags.push(etiquette.tag);
      }
      const source = mapSource(lead.source);
      if (source.composite) {
        report.warn(LEADS, lead.row, IMPORT_ROW_CODES.COMPOSITE_VALUE, `Composite source « ${lead.source} » — first value kept`, 'Source');
      }
      if (lead.source && !source.key) {
        report.warn(LEADS, lead.row, IMPORT_ROW_CODES.UNKNOWN_REFERENCE, `Source « ${lead.source} » is outside the §3.3 table — left empty`, 'Source');
      }
      let solution: string | null = null;
      if (lead.editor) {
        solution = EDITOR_MAP[canonical(lead.editor)] ?? null;
        if (!solution) {
          solution = 'OTHER';
          report.warn(LEADS, lead.row, IMPORT_ROW_CODES.UNKNOWN_EDITOR, `Éditeur « ${lead.editor} » unknown — imported as Autre solution (§3.4)`, 'Éditeur');
        }
      }
      const notes = [lead.comment, lead.comment2].filter(Boolean).join(' — ') || null;

      // §5 — an existing record only gets its empty fields filled, never a rewrite
      const match = byKey.get(key);
      if (match) {
        const data: Prisma.OrganizationUncheckedUpdateInput = {};
        if (solution && !match.solution) data.solution = solution;
        if (source.key && !match.leadSource) data.leadSource = source.key;
        if (notes && !match.notes) data.notes = notes;
        if (!match.salesRepId && defaultRep) data.salesRepId = defaultRep.userId;
        if (tags.length && !match.tags.length) data.tags = tags;
        if (Object.keys(data).length) {
          report.updated(IMPORT_RESOURCES.ORGANIZATIONS);
          updates.push({ id: match.id, data });
        } else {
          report.skipped(IMPORT_RESOURCES.ORGANIZATIONS);
        }
      } else {
        // §5 — close names in the same department: both kept, flagged for a human
        for (const [otherKey, other] of byKey) {
          if (otherKey.startsWith(`${department}::`) && levenshtein(otherKey, key, 2) <= 2) {
            report.warn(LEADS, lead.row, IMPORT_ROW_CODES.POSSIBLE_DUPLICATE, `« ${lead.name} » is very close to « ${other.name}» — both records kept`, 'Commune / Collectivité');
            break;
          }
        }
        report.created(IMPORT_RESOURCES.ORGANIZATIONS);
        creates.push({
          key,
          data: {
            projectId,
            name: lead.name,
            type,
            department,
            priority,
            tags,
            solution,
            leadSource: source.key,
            salesStatus,
            salesRepId: defaultRep?.userId ?? null,
            notes,
            completenessScore: completenessScore({
              siret: null,
              address: null,
              postalCode: null,
              population: null,
              email: null,
              hasPrimaryContact: false,
            }),
          },
        });
      }

      // §4 — best-effort contact, flagged extractedFromNote for human review
      const orgId = match?.id ?? null;
      let contactPlanned = false;
      if (lead.comment) {
        const extracted = extractContact(lead.comment);
        if (!extracted) {
          report.warn(LEADS, lead.row, IMPORT_ROW_CODES.CONTACT_NOT_EXTRACTED, `No « Civilité NOM : » pattern in the comment — contact to enter by hand`, 'Commentaire');
        } else if (orgId && contactKeys.has(`${orgId}::${extracted.lastName.toLowerCase()}`)) {
          report.skipped(IMPORT_RESOURCES.CONTACTS);
        } else {
          report.created(IMPORT_RESOURCES.CONTACTS);
          contactPlanned = true;
          contacts.push({
            orgKey: key,
            orgId,
            data: {
              civility: extracted.civility,
              firstName: '',
              lastName: extracted.lastName,
              phone: extracted.phone,
              isPrimary: !(orgId ? primaryOrgIds.has(orgId) : false),
              extractedFromNote: true,
            },
          });
        }
      }

      // §2.1 H — the meeting; §4.3 — the remaining comment as a done NOTE
      let meetingDate = lead.meetingDate;
      if (meetingDate && !DAY_PATTERN.test(meetingDate)) {
        report.warn(LEADS, lead.row, IMPORT_ROW_CODES.INVALID_VALUE, `DATE RDV « ${meetingDate} » is not a readable date — no meeting created`, 'DATE RDV');
        meetingDate = '';
      }
      if (defaultRep) {
        const planned: { type: string; date: string; status: ActivityStatus; report: string | null }[] = [];
        if (meetingDate) {
          planned.push({
            type: 'MEETING',
            date: meetingDate,
            status: meetingDate < today ? ActivityStatus.DONE : ActivityStatus.PLANNED,
            report: null,
          });
        }
        if (notes) {
          planned.push({ type: 'NOTE', date: meetingDate || today, status: ActivityStatus.DONE, report: notes });
        }
        for (const a of planned) {
          if (orgId && activityKeys.has(`${orgId}::${a.type}::${a.date}`)) {
            report.skipped(IMPORT_RESOURCES.ACTIVITIES);
            continue;
          }
          report.created(IMPORT_RESOURCES.ACTIVITIES);
          activities.push({
            orgKey: key,
            orgId,
            contactKey: a.type === 'NOTE' && contactPlanned ? key : null,
            data: {
              userId: defaultRep.userId,
              type: a.type,
              date: new Date(`${a.date}T00:00:00.000Z`),
              status: a.status,
              report: a.report,
              completedAt: a.status === ActivityStatus.DONE ? new Date(`${a.date}T00:00:00.000Z`) : null,
            },
          });
        }
      }
    }

    return {
      report,
      apply: (batchId, _user) => this.apply(projectId, batchId, { creates, updates, contacts, activities }),
    };
  }

  // ------------------------------------------------------------------------------ apply

  private async apply(
    projectId: string,
    batchId: string,
    plan: { creates: OrgPlan[]; updates: OrgUpdate[]; contacts: ContactPlan[]; activities: ActivityPlan[] },
  ): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const created = await tx.organization.createManyAndReturn({
          data: plan.creates.map((c) => ({ ...c.data, importBatchId: batchId })),
          select: { id: true, name: true, department: true },
        });
        const idByKey = new Map(created.map((o) => [normalizeOrgKey(o.department, o.name), o.id]));
        for (const update of plan.updates) {
          await tx.organization.update({ where: { id: update.id }, data: update.data });
        }

        const createdContacts = await tx.contact.createManyAndReturn({
          data: plan.contacts.map((c) => ({
            ...c.data,
            projectId,
            importBatchId: batchId,
            organizationId: c.orgId ?? idByKey.get(c.orgKey)!,
          })),
          select: { id: true, organizationId: true },
        });
        const contactByOrg = new Map(createdContacts.map((c) => [c.organizationId, c.id]));

        if (plan.activities.length) {
          await tx.activity.createMany({
            data: plan.activities.map((a) => {
              const organizationId = a.orgId ?? idByKey.get(a.orgKey)!;
              return {
                ...a.data,
                projectId,
                importBatchId: batchId,
                organizationId,
                contactId: a.contactKey ? (contactByOrg.get(organizationId) ?? null) : null,
              };
            }),
          });
        }

        const touched = new Set<string>([
          ...created.map((o) => o.id),
          ...plan.updates.map((u) => u.id),
          ...plan.contacts.map((c) => c.orgId).filter((id): id is string => !!id),
          ...plan.activities.map((a) => a.orgId).filter((id): id is string => !!id),
        ]);
        for (const id of touched) {
          await recomputeCompleteness(tx, id);
          await recomputeActivityMarks(tx, id);
        }
      },
      { timeout: APPLY_TIMEOUT_MS },
    );
  }

}
