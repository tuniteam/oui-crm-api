// ============================================
// OUI-CRM - Contacts service (US-01-04)
// ============================================

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditLogService } from '@/audit-log/audit-log.service';
import { AUDIT_OBJECTS } from '@/audit-log/audit-log.constants';
import { AuthenticatedUser } from '@/auth/interfaces/authenticated-user.interface';
import { apiError } from '@/common/api-error';
import { fullName } from '@/common/utils/user.utils';
import { isUniqueViolation } from '@/common/utils/prisma.utils';
import { PrismaService } from '@/prisma/prisma.service';
import { ScopeService } from '@/scopes/scope.service';
import { loadScopeContext } from '@/scopes/scopes.utils';
import { assertFullOrganizationAccess, getOrganizationOrThrow, recomputeCompleteness } from '@/organizations/organizations.utils';
import { CONTACTS_AUDIT } from './contacts.constants';
import { getContactOrThrow, mapToContact } from './contacts.utils';
import { CreateContactDto } from './dto/create-contact.dto';
import { ContactDto, ContactsListResponseDto } from './dto/response-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

/**
 * Contacts are the details of a record: they always require FULL geographic access — a
 * RESTRICTED caller sees the record in its list but gets 403 here, a NONE caller gets the
 * organization's 404 (its existence is never revealed).
 */
@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: ScopeService,
    private readonly audit: AuditLogService,
  ) {}

  async findAll(organizationId: string, projectId: string, user: AuthenticatedUser): Promise<ContactsListResponseDto> {
    await this.getOrganizationWithFullAccess(organizationId, projectId, user);
    const contacts = await this.prisma.contact.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: [{ isPrimary: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }],
    });
    return { data: contacts.map(mapToContact) };
  }

  async create(organizationId: string, dto: CreateContactDto, projectId: string, user: AuthenticatedUser): Promise<ContactDto> {
    await this.getOrganizationWithFullAccess(organizationId, projectId, user);

    const contact = await this.transactionMappingPrimaryRace(async (tx) => {
      if (dto.isPrimary) await this.demoteCurrentPrimary(tx, organizationId);
      const created = await tx.contact.create({ data: { ...dto, projectId, organizationId } });
      // PRIMARY_CONTACT is a completeness criterion of the organization (SPEC-13 §2.4)
      await recomputeCompleteness(tx, organizationId);
      await this.audit.log(tx, {
        projectId,
        userId: user.id,
        action: CONTACTS_AUDIT.CREATE,
        objectType: AUDIT_OBJECTS.CONTACT,
        objectId: created.id,
        metadata: { organizationId, name: fullName(created) },
      });
      return created;
    });
    return mapToContact(contact);
  }

  async update(contactId: string, dto: UpdateContactDto, projectId: string, user: AuthenticatedUser): Promise<ContactDto> {
    if (Object.keys(dto).length === 0) throw apiError.badRequest('EMPTY_UPDATE_PAYLOAD');
    const existing = await getContactOrThrow(this.prisma, contactId, projectId);
    await this.assertFullAccess(existing.organization, projectId, user);

    const contact = await this.transactionMappingPrimaryRace(async (tx) => {
      if (dto.isPrimary) await this.demoteCurrentPrimary(tx, existing.organizationId, contactId);
      const updated = await tx.contact.update({ where: { id: contactId }, data: dto });
      await recomputeCompleteness(tx, existing.organizationId);
      await this.audit.log(tx, {
        projectId,
        userId: user.id,
        action: CONTACTS_AUDIT.UPDATE,
        objectType: AUDIT_OBJECTS.CONTACT,
        objectId: contactId,
        metadata: { organizationId: existing.organizationId, fields: Object.keys(dto) },
      });
      return updated;
    });
    return mapToContact(contact);
  }

  /** Soft delete. A contact referenced by activities stays (409): history must keep its actors. */
  async remove(contactId: string, projectId: string, user: AuthenticatedUser): Promise<void> {
    const existing = await getContactOrThrow(this.prisma, contactId, projectId);
    await this.assertFullAccess(existing.organization, projectId, user);

    const activities = await this.prisma.activity.count({ where: { contactId } });
    if (activities > 0) throw apiError.conflict('CONTACT_HAS_ACTIVITIES');

    await this.prisma.$transaction(async (tx) => {
      await tx.contact.update({ where: { id: contactId }, data: { deletedAt: new Date(), isPrimary: false } });
      await recomputeCompleteness(tx, existing.organizationId);
      await this.audit.log(tx, {
        projectId,
        userId: user.id,
        action: CONTACTS_AUDIT.DELETE,
        objectType: AUDIT_OBJECTS.CONTACT,
        objectId: contactId,
        metadata: { organizationId: existing.organizationId, name: fullName(existing) },
      });
    });
  }

  // ----------------------------------------------------------------------------------------

  private async getOrganizationWithFullAccess(organizationId: string, projectId: string, user: AuthenticatedUser) {
    const organization = await getOrganizationOrThrow(this.prisma, organizationId, projectId);
    await this.assertFullAccess(organization, projectId, user);
    return organization;
  }

  private async assertFullAccess(organization: Parameters<typeof assertFullOrganizationAccess>[3], projectId: string, user: AuthenticatedUser): Promise<void> {
    const ctx = await loadScopeContext(this.prisma, user, projectId);
    await assertFullOrganizationAccess(this.prisma, this.scopeService, ctx, organization, organization.id);
  }

  /** "The new one replaces the previous one" (SPEC-07): demotion and promotion share the transaction. */
  private demoteCurrentPrimary(tx: Prisma.TransactionClient, organizationId: string, exceptId?: string) {
    return tx.contact.updateMany({
      where: { organizationId, isPrimary: true, deletedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) },
      data: { isPrimary: false },
    });
  }

  /** The partial unique index is the referee of a concurrent double promotion. */
  private async transactionMappingPrimaryRace<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(fn);
    } catch (err) {
      if (isUniqueViolation(err, 'is_primary')) throw apiError.conflict('CONTACT_PRIMARY_CONFLICT');
      throw err;
    }
  }
}
