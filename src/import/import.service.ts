import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '@/auth/interfaces/authenticated-user.interface';
import { AuditLogService } from '@/audit-log/audit-log.service';
import { AUDIT_OBJECTS } from '@/audit-log/audit-log.constants';
import { apiError } from '@/common/api-error';
import { recomputeCompleteness } from '@/organizations/organizations.utils';
import { PrismaService } from '@/prisma/prisma.service';
import { IMPORT_AUDIT, IMPORT_BATCH_MODIFIED_TOLERANCE_MS } from './import.constants';

/**
 * Shared batch lifecycle (US-01-06/14): every profile stamps what it creates with
 * `importBatchId`, so a batch can be cancelled in one block — but only while none of its
 * records has been touched since (any later write bumps `updatedAt`, imports never do).
 */
@Injectable()
export class ImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async cancelBatch(projectId: string, batchId: string, user: AuthenticatedUser): Promise<void> {
    const batch = await this.prisma.importBatch.findFirst({ where: { id: batchId, projectId } });
    if (!batch) throw apiError.notFound('IMPORT_BATCH_NOT_FOUND', batchId);
    if (batch.status === 'CANCELLED') return; // idempotent

    const [organizations, contacts] = await Promise.all([
      this.prisma.organization.findMany({
        where: { importBatchId: batchId },
        select: { id: true, createdAt: true, updatedAt: true },
      }),
      this.prisma.contact.findMany({
        where: { importBatchId: batchId },
        select: { id: true, organizationId: true, createdAt: true, updatedAt: true, deletedAt: true },
      }),
    ]);
    const drifted = (row: { createdAt: Date; updatedAt: Date }): boolean =>
      row.updatedAt.getTime() - row.createdAt.getTime() > IMPORT_BATCH_MODIFIED_TOLERANCE_MS;
    if (organizations.some(drifted) || contacts.some((c) => drifted(c) || c.deletedAt !== null)) {
      throw apiError.conflict('IMPORT_BATCH_MODIFIED');
    }

    const batchOrgIds = new Set(organizations.map((o) => o.id));
    const hostOrgIds = [...new Set(contacts.map((c) => c.organizationId))].filter((id) => !batchOrgIds.has(id));

    await this.prisma.$transaction(async (tx) => {
      // Hard delete: import artifacts nobody touched — contacts, activities and campaign
      // links cascade with their organization; contacts imported onto pre-existing records
      // are removed too. Field fills and population refreshes are NOT reverted.
      await tx.contact.deleteMany({ where: { importBatchId: batchId } });
      await tx.organization.deleteMany({ where: { importBatchId: batchId } });
      // The primary-contact criterion may have changed on the host records
      for (const id of hostOrgIds) await recomputeCompleteness(tx, id);
      await tx.importBatch.update({ where: { id: batchId }, data: { status: 'CANCELLED', canceledAt: new Date() } });
      await this.audit.log(tx, {
        projectId,
        userId: user.id,
        action: IMPORT_AUDIT.CANCEL,
        objectType: AUDIT_OBJECTS.IMPORT_BATCH,
        objectId: batchId,
        metadata: { profile: batch.profile, deleted: organizations.length, deletedContacts: contacts.length },
      });
    });
  }
}
