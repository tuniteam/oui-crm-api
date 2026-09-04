import { Module } from '@nestjs/common';
import { registerLabelResolver } from '@/audit-log/audit-log-labels';
import { AUDIT_OBJECTS } from '@/audit-log/audit-log.constants';
import { AuthModule } from '@/auth/auth.module';
import { DocumentsModule } from '@/documents/documents.module';
import { FilesModule } from '@/files/files.module';
import { registerOwnerChecker } from '@/files/files.utils';
import { PricingModule } from '@/pricing/pricing.module';
import { ScopesModule } from '@/scopes/scopes.module';
import { FileOwnerType } from '@prisma/client';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';

// The journal shows a quote by its number (US-00-10 label registry).
registerLabelResolver(AUDIT_OBJECTS.QUOTE, async (db, projectId, ids) => {
  const rows = await db.quote.findMany({ where: { id: { in: ids }, projectId }, select: { id: true, number: true } });
  return new Map(rows.map((q) => [q.id, q.number]));
});

// Le retour signé se range sous son devis : sans ce contrôleur d'existence, l'upload répondrait
// `FILE_OWNER_TYPE_NOT_SUPPORTED` (le registre du L0 ne connaît que USER et PROJECT).
registerOwnerChecker(FileOwnerType.QUOTE, async (prisma, ownerId, projectId) => {
  const quote = await prisma.quote.findFirst({
    where: { id: ownerId, ...(projectId ? { projectId } : {}) },
    select: { id: true },
  });
  return !!quote;
});

@Module({
  imports: [AuthModule, ScopesModule, PricingModule, FilesModule, DocumentsModule],
  controllers: [QuotesController],
  providers: [QuotesService],
  exports: [QuotesService],
})
export class QuotesModule {}
