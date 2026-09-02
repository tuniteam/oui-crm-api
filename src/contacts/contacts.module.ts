import { Module } from '@nestjs/common';
import { registerLabelResolver } from '@/audit-log/audit-log-labels';
import { AUDIT_OBJECTS } from '@/audit-log/audit-log.constants';
import { AuthModule } from '@/auth/auth.module';
import { fullName } from '@/common/utils/user.utils';
import { ScopesModule } from '@/scopes/scopes.module';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';

// The audit journal shows a contact by their name (US-00-10 label registry, wired at L1).
registerLabelResolver(AUDIT_OBJECTS.CONTACT, async (db, projectId, ids) => {
  const rows = await db.contact.findMany({
    where: { id: { in: ids }, projectId },
    select: { id: true, firstName: true, lastName: true },
  });
  return new Map(rows.map((c) => [c.id, fullName(c)]));
});

@Module({
  imports: [AuthModule, ScopesModule],
  controllers: [ContactsController],
  providers: [ContactsService],
})
export class ContactsModule {}
