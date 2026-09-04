import { Injectable } from '@nestjs/common';
import {
  DocumentTemplateType,
  FileCategory,
  FileOwnerType,
  QuoteOrigin,
  QuoteStatus,
} from '@prisma/client';
import { apiError } from '@/common/api-error';
import { FileService } from '@/files/file.service';
import { PrismaService } from '@/prisma/prisma.service';
import { QuoteConfig, QuoteResult } from '@/pricing/pricing.types';
import {
  SIGNATURE_IMAGE_MISSING,
  SUPPORTED_FORMATS,
  WATERMARKED_STATUSES,
} from './documents.constants';
import { DocumentRenderService } from './document-render.service';
import { dataUri, documentFileName } from './documents.utils';
import { quoteTemplateData } from './quote-document.utils';

/** Ce qu'une génération rend : le fichier, et ce qu'il faut dire à l'appelant. */
export interface RenderedDocument {
  buffer: Buffer;
  fileName: string;
  warnings: string[];
}

/**
 * US-02-08 — le devis en PDF. Le gabarit appartient au projet (téléversé par un administrateur,
 * versionné depuis le L0) ; ce service l'assortit des données du devis et le rend.
 *
 * Le document n'est **jamais** une raison de faire échouer une action commerciale : cachet
 * manquant → avertissement, pas d'erreur (SPEC-02 §5.3) ; archivage impossible à la soumission →
 * la soumission reste valide (SPEC-14 D17).
 */
@Injectable()
export class QuoteDocumentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly renderer: DocumentRenderService,
    private readonly files: FileService,
  ) {}

  /** Le format demandé est-il servi ? `docx` viendra du même HTML, plus tard. */
  assertFormat(format: string): void {
    if (!SUPPORTED_FORMATS.includes(format as (typeof SUPPORTED_FORMATS)[number])) {
      throw apiError.badRequest('FORMAT_NOT_SUPPORTED', format);
    }
  }

  /**
   * Un devis repris du classeur (SPEC-05 §2.2) n'a ni configuration ni lignes calculables : il
   * n'y a rien à imprimer. La garde est **publique** parce qu'elle doit être posée avant tout
   * calcul : sinon le moteur tarifaire échoue le premier, sur une erreur qui n'explique rien
   * (constaté en recette le 04/09).
   */
  assertPrintable(quote: { origin: QuoteOrigin; config: unknown }): void {
    if (quote.origin === QuoteOrigin.IMPORTED || !quote.config) {
      throw apiError.unprocessable('QUOTE_IMPORTED_NO_DOCUMENT');
    }
  }

  /**
   * Produit le PDF d'un devis. Le filigrane « BROUILLON » reste tant que le devis n'a pas
   * atteint `SENT` : ni un brouillon ni un devis en attente de validation n'est officiel (D18).
   */
  async render(
    projectId: string,
    quote: {
      id: string;
      number: string;
      status: QuoteStatus;
      origin: QuoteOrigin;
      issueDate: Date;
      validUntil: Date;
      startDate: Date;
      signedAt: Date | null;
      config: unknown;
      ownerId: string | null;
      organizationId: string;
    },
    result: QuoteResult,
  ): Promise<RenderedDocument> {
    this.assertPrintable(quote);

    const [template, organization, settings, project, owner, signature] = await Promise.all([
      this.activeTemplate(projectId, DocumentTemplateType.QUOTE),
      this.prisma.organization.findUniqueOrThrow({ where: { id: quote.organizationId } }),
      this.prisma.settings.findUniqueOrThrow({ where: { projectId } }),
      this.prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { name: true } }),
      quote.ownerId
        ? this.prisma.user.findUnique({
            where: { id: quote.ownerId },
            select: { firstName: true, lastName: true, email: true },
          })
        : null,
      this.signatureImage(projectId),
    ]);

    const data = quoteTemplateData(
      { ...quote, config: quote.config as unknown as QuoteConfig },
      organization,
      settings,
      result,
      owner ? { name: `${owner.firstName} ${owner.lastName}`, role: '', email: owner.email } : null,
      signature,
    );

    const buffer = await this.renderer.fromTemplate(template, data, {
      watermark: WATERMARKED_STATUSES.includes(quote.status),
    });

    return {
      buffer,
      fileName: documentFileName(project.name, 'Devis', quote.number),
      warnings: signature ? [] : [SIGNATURE_IMAGE_MISSING],
    };
  }

  /**
   * Archive le PDF officiel d'un devis soumis (`QUOTE_PDF`, jamais supprimable). **Au mieux**
   * (D17) : un gabarit absent ou un rendu en échec ne remet pas en cause la soumission — la
   * route de téléchargement re-génère à l'identique depuis les lignes figées.
   */
  async archive(
    projectId: string,
    quote: Parameters<QuoteDocumentService['render']>[1],
    result: QuoteResult,
    userId: string,
  ): Promise<string | null> {
    try {
      const document = await this.render(projectId, quote, result);
      const saved = await this.files.upload({
        projectId,
        ownerType: FileOwnerType.QUOTE,
        ownerId: quote.id,
        category: FileCategory.QUOTE_PDF,
        buffer: document.buffer,
        fileName: document.fileName,
        declaredMimeType: 'application/pdf',
        uploadedBy: userId,
      });
      return saved.id;
    } catch {
      // Silence assumé : la soumission est déjà écrite, et le document se régénère à la demande.
      return null;
    }
  }

  /** Le gabarit actif du projet : le dernier téléversé (règle du L0). */
  private async activeTemplate(projectId: string, type: DocumentTemplateType): Promise<string> {
    const file = await this.prisma.file.findFirst({
      where: {
        projectId,
        ownerType: FileOwnerType.PROJECT,
        category: FileCategory.HTML_TEMPLATE,
        templateType: type,
      },
      orderBy: { uploadedAt: 'desc' },
    });
    if (!file) throw apiError.notFound('TEMPLATE_NOT_CONFIGURED', type);
    return (await this.files.getBuffer(file)).toString('utf8');
  }

  /** Le cachet du projet en data URI, ou une chaîne vide — jamais une erreur. */
  private async signatureImage(projectId: string): Promise<string> {
    const file = await this.prisma.file.findFirst({
      where: {
        projectId,
        ownerType: FileOwnerType.PROJECT,
        category: FileCategory.SIGNATURE_IMAGE,
      },
      orderBy: { uploadedAt: 'desc' },
    });
    if (!file) return '';
    try {
      return dataUri(await this.files.getBuffer(file), file.mimeType);
    } catch {
      return '';
    }
  }
}
