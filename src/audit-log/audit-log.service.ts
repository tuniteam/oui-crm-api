import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

export interface AuditEntry {
  /** null = platform-level operation (project administration, backoffice). */
  projectId: string | null;
  userId: string | null;
  /** `object.verb`, e.g. 'project.create', 'quote.validate' (SPEC-02 §4.3). */
  action: string;
  objectType?: string;
  objectId?: string;
  metadata?: Prisma.InputJsonValue;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Append-only journal (SPEC-02 §4.3). `log()` takes the transaction client of the operation so
 * the entry is committed with it, or rolled back with it. Reading and export: phase H.
 */
@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async log(db: Prisma.TransactionClient | PrismaService, entry: AuditEntry): Promise<void> {
    await db.auditLog.create({
      data: {
        projectId: entry.projectId,
        userId: entry.userId,
        action: entry.action,
        objectType: entry.objectType ?? null,
        objectId: entry.objectId ?? null,
        metadata: entry.metadata,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
      },
    });
  }

  /** Convenience for operations without a surrounding transaction. */
  logNow(entry: AuditEntry): Promise<void> {
    return this.log(this.prisma, entry);
  }
}
