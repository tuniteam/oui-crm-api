import { Contact, Organization, Prisma, PrismaClient } from '@prisma/client';
import { apiError } from '@/common/api-error';
import { ContactDto } from './dto/response-contact.dto';

type Db = Pick<PrismaClient, 'contact'> | Prisma.TransactionClient;

/**
 * 404 CONTACT_NOT_FOUND for an unknown, deleted or other-project contact (no leak). The
 * organization comes along: the caller needs it for the geographic-access check.
 */
export async function getContactOrThrow(
  db: Db,
  contactId: string,
  projectId: string,
): Promise<Contact & { organization: Organization }> {
  const contact = await db.contact.findFirst({
    where: { id: contactId, projectId, deletedAt: null },
    include: { organization: true },
  });
  if (!contact || contact.organization.deletedAt) throw apiError.notFound('CONTACT_NOT_FOUND', contactId);
  return contact;
}

export function mapToContact(contact: Contact): ContactDto {
  return {
    id: contact.id,
    civility: contact.civility,
    firstName: contact.firstName,
    lastName: contact.lastName,
    role: contact.role,
    email: contact.email,
    phone: contact.phone,
    mobile: contact.mobile,
    isPrimary: contact.isPrimary,
    optOut: contact.optOut,
    notes: contact.notes,
    extractedFromNote: contact.extractedFromNote,
    updatedAt: contact.updatedAt,
  };
}
