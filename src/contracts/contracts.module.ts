import { Module } from '@nestjs/common';
import { registerLabelResolver } from '@/audit-log/audit-log-labels';
import { AUDIT_OBJECTS } from '@/audit-log/audit-log.constants';
import { AuthModule } from '@/auth/auth.module';
import { QuotesModule } from '@/quotes/quotes.module';
import { ScopesModule } from '@/scopes/scopes.module';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';

// Le journal montre un contrat par son numéro, jamais par son cuid (US-00-10).
registerLabelResolver(AUDIT_OBJECTS.CONTRACT, async (db, projectId, ids) => {
  const rows = await db.contract.findMany({
    where: { id: { in: ids }, projectId },
    select: { id: true, number: true },
  });
  return new Map(rows.map((c) => [c.id, c.number]));
});

@Module({
  imports: [AuthModule, ScopesModule, QuotesModule],
  controllers: [ContractsController],
  providers: [ContractsService],
})
export class ContractsModule {}
