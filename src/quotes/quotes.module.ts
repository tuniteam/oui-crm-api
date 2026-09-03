import { Module } from '@nestjs/common';
import { registerLabelResolver } from '@/audit-log/audit-log-labels';
import { AUDIT_OBJECTS } from '@/audit-log/audit-log.constants';
import { AuthModule } from '@/auth/auth.module';
import { PricingModule } from '@/pricing/pricing.module';
import { ScopesModule } from '@/scopes/scopes.module';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';

// The journal shows a quote by its number (US-00-10 label registry).
registerLabelResolver(AUDIT_OBJECTS.QUOTE, async (db, projectId, ids) => {
  const rows = await db.quote.findMany({ where: { id: { in: ids }, projectId }, select: { id: true, number: true } });
  return new Map(rows.map((q) => [q.id, q.number]));
});

@Module({
  imports: [AuthModule, ScopesModule, PricingModule],
  controllers: [QuotesController],
  providers: [QuotesService],
})
export class QuotesModule {}
