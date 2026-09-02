import { Module } from '@nestjs/common';
import { registerLabelResolver } from '@/audit-log/audit-log-labels';
import { AUDIT_OBJECTS } from '@/audit-log/audit-log.constants';
import { AuthModule } from '@/auth/auth.module';
import { formatDateField } from '@/common/utils/date.utils';
import { ScopesModule } from '@/scopes/scopes.module';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';

// The journal shows an activity as "TYPE YYYY-MM-DD" (US-00-10 label registry).
registerLabelResolver(AUDIT_OBJECTS.ACTIVITY, async (db, projectId, ids) => {
  const rows = await db.activity.findMany({
    where: { id: { in: ids }, projectId },
    select: { id: true, type: true, date: true },
  });
  return new Map(rows.map((a) => [a.id, `${a.type} ${formatDateField(a.date)}`]));
});

@Module({
  imports: [AuthModule, ScopesModule],
  controllers: [ActivitiesController],
  providers: [ActivitiesService],
})
export class ActivitiesModule {}
