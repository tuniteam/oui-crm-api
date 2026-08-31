import { Injectable, Logger } from '@nestjs/common';
import { EmailLogStatus, EmailLogType } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { ApiMessages } from '@/common';
import { MAIL_SMTP_CONCURRENCY } from './mail.constants';
// p-limit v3 uses `export = pLimit` (CommonJS) — require-form import matches type + runtime.
import pLimit = require('p-limit');

export type EmailLogEntry = {
  /** null for account e-mails (activation, reset) — SPEC-02 §2.7 nullable rule */
  projectId: string | null;
  type: EmailLogType;
  targetType: string;
  targetId: string;
  recipient: string;
  createdBy?: string | null;
};

export type QueuedEmailLog = {
  id: string;
  targetId: string;
  recipient: string;
  status: EmailLogStatus;
};

/**
 * Traceable e-mail dispatch, shared by every module that sends mails.
 *
 * Owns the generic part: PENDING EmailLog rows, throttled fire-and-forget dispatch,
 * and the SENT / FAILED outcome (attempts + errorMessage). Callers only provide the
 * actual send closure, which knows the template and its params.
 */
@Injectable()
export class EmailLogService {
  private readonly logger = new Logger(EmailLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Queue the entries as PENDING logs then dispatch them in the background.
   * Returns the created logs so the caller can expose them in its response.
   */
  async queueAndDispatch<T extends EmailLogEntry>(
    entries: T[],
    send: (entry: T) => Promise<boolean>,
  ): Promise<QueuedEmailLog[]> {
    if (entries.length === 0) return [];

    const created = await this.prisma.emailLog.createManyAndReturn({
      data: entries.map((e) => ({
        projectId: e.projectId,
        type: e.type,
        targetType: e.targetType,
        targetId: e.targetId,
        recipient: e.recipient,
        status: EmailLogStatus.PENDING,
        createdBy: e.createdBy ?? null,
      })),
      select: { id: true, targetId: true, recipient: true, status: true },
    });

    // Pair each created row with its entry by (targetId, recipient) rather than by
    // index: it does not rely on createManyAndReturn preserving the input order.
    const byKey = new Map(entries.map((e) => [`${e.targetId}|${e.recipient}`, e]));

    // Fire-and-forget, throttled — never blocks the HTTP response (CLAUDE.md #7).
    const limit = pLimit(MAIL_SMTP_CONCURRENCY);
    for (const log of created) {
      const entry = byKey.get(`${log.targetId}|${log.recipient}`);
      if (!entry) continue;
      void limit(() =>
        this.run(log.id, entry, send).catch((err) => {
          this.logger.error(`[EmailLog] job ${log.id} crashed: ${err?.message ?? err}`);
        }),
      );
    }

    return created;
  }

  private async run<T extends EmailLogEntry>(
    logId: string,
    entry: T,
    send: (entry: T) => Promise<boolean>,
  ): Promise<void> {
    let ok = false;
    let error: string | null = null;
    try {
      ok = await send(entry);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    await this.prisma.emailLog.update({
      where: { id: logId, projectId: entry.projectId },
      data: ok
        ? { status: EmailLogStatus.SENT, sentAt: new Date(), attempts: { increment: 1 } }
        : {
            status: EmailLogStatus.FAILED,
            attempts: { increment: 1 },
            errorMessage: error ?? ApiMessages.errors.message.EMAIL_SEND_FAILED,
          },
    });
  }
}
