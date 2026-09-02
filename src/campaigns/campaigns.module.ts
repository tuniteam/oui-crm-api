import { Module } from '@nestjs/common';
import { registerLabelResolver } from '@/audit-log/audit-log-labels';
import { AUDIT_OBJECTS } from '@/audit-log/audit-log.constants';
import { AuthModule } from '@/auth/auth.module';
import { ScopesModule } from '@/scopes/scopes.module';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';

// The journal shows a campaign by its name (US-00-10 label registry).
registerLabelResolver(AUDIT_OBJECTS.CAMPAIGN, async (db, projectId, ids) => {
  const rows = await db.campaign.findMany({ where: { id: { in: ids }, projectId }, select: { id: true, name: true } });
  return new Map(rows.map((c) => [c.id, c.name]));
});

@Module({
  imports: [AuthModule, ScopesModule],
  controllers: [CampaignsController],
  providers: [CampaignsService],
})
export class CampaignsModule {}
