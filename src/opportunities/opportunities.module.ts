import { Module } from '@nestjs/common';
import { registerLabelResolver } from '@/audit-log/audit-log-labels';
import { AUDIT_OBJECTS } from '@/audit-log/audit-log.constants';
import { AuthModule } from '@/auth/auth.module';
import { ScopesModule } from '@/scopes/scopes.module';
import { OpportunitiesController } from './opportunities.controller';
import { OpportunitiesService } from './opportunities.service';

// The journal shows an opportunity by its label (US-00-10 label registry).
registerLabelResolver(AUDIT_OBJECTS.OPPORTUNITY, async (db, projectId, ids) => {
  const rows = await db.opportunity.findMany({
    where: { id: { in: ids }, projectId },
    select: { id: true, label: true, organization: { select: { name: true } } },
  });
  return new Map(rows.map((o) => [o.id, o.label ?? o.organization.name]));
});

@Module({
  imports: [AuthModule, ScopesModule],
  controllers: [OpportunitiesController],
  providers: [OpportunitiesService],
})
export class OpportunitiesModule {}
