import { Module } from '@nestjs/common';
import { FileOwnerType } from '@prisma/client';
import { registerLabelResolver } from '@/audit-log/audit-log-labels';
import { AUDIT_OBJECTS } from '@/audit-log/audit-log.constants';
import { AuditLogModule } from '@/audit-log/audit-log.module';
import { registerOwnerChecker } from '@/files/files.utils';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';
import { TerritoryController } from './territory.controller';
import { TerritoryService } from './territory.service';

// The journal shows a batch by its profile (US-00-10 label registry).
registerLabelResolver(AUDIT_OBJECTS.IMPORT_BATCH, async (db, projectId, ids) => {
  const rows = await db.importBatch.findMany({ where: { id: { in: ids }, projectId }, select: { id: true, profile: true } });
  return new Map(rows.map((b) => [b.id, b.profile]));
});

// L0 left the hook (files.utils): the source file of an import is owned by its batch.
registerOwnerChecker(FileOwnerType.IMPORT_BATCH, async (prisma, ownerId, projectId) => {
  const batch = await prisma.importBatch.findFirst({
    where: { id: ownerId, ...(projectId ? { projectId } : {}) },
    select: { id: true },
  });
  return !!batch;
});

@Module({
  imports: [AuditLogModule],
  controllers: [ImportController, TerritoryController],
  providers: [ImportService, TerritoryService],
})
export class ImportModule {}
