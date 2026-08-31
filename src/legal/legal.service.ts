import { Injectable } from '@nestjs/common';
import { AuditLogService } from '@/audit-log/audit-log.service';
import { apiError } from '@/common/api-error';
import { LegalDocument } from '@/common/legal/legal.constants';
import { computeOutdatedLegalDocuments, stampConsents } from '@/common/legal/legal.utils';
import { PrismaService } from '@/prisma/prisma.service';
import { LegalAcceptDto, LegalAcceptResponseDto } from './dto/legal-accept.dto';

const LEGAL_AUDIT_ACCEPT = 'legal.accept';
const AUDIT_OBJECT_USER = 'User';

/**
 * US-00-03 — re-acceptance of updated legal documents. The current versions come from the
 * server constants, never from the payload (front and back stay aligned via /profile/me).
 */
@Injectable()
export class LegalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async accept(userId: string, dto: LegalAcceptDto): Promise<LegalAcceptResponseDto> {
    const accepted: LegalDocument[] = [];
    if (dto.cgu === true) accepted.push(LegalDocument.CGU);
    if (dto.rgpd === true) accepted.push(LegalDocument.RGPD);
    if (accepted.length === 0) throw apiError.badRequest('INVALID_DATA');

    await this.prisma.$transaction(async (tx) => {
      await stampConsents(tx, userId, accepted);
      await this.audit.log(tx, {
        projectId: null,
        userId,
        action: LEGAL_AUDIT_ACCEPT,
        objectType: AUDIT_OBJECT_USER,
        objectId: userId,
        metadata: { accepted },
      });
    });

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { cguVersion: true, cguAcceptedAt: true, rgpdVersion: true, rgpdAcceptedAt: true },
    });
    return { accepted, legalReacceptanceRequired: computeOutdatedLegalDocuments(user).length > 0 };
  }
}
