import { Injectable } from '@nestjs/common';
import { DocumentTemplateType, File, FileCategory, FileOwnerType, Prisma } from '@prisma/client';
import { AUDIT_OBJECTS } from '@/audit-log/audit-log.constants';
import { AuditLogService } from '@/audit-log/audit-log.service';
import { AuthenticatedUser } from '@/auth/interfaces/authenticated-user.interface';
import { apiError, withDetails } from '@/common/api-error';
import { MIME } from '@/common/constants/mime.constants';
import { FileService } from '@/files/file.service';
import { assertFilePresent } from '@/files/files.utils';
import { UploadedFileLike } from '@/files/uploaded-file.interface';
import { DocumentRenderService } from '@/documents/document-render.service';
import { dataUri } from '@/documents/documents.utils';
import { previewQuoteData } from '@/documents/preview.fixture';
import { PrismaService } from '@/prisma/prisma.service';
import { DocumentsResponseDto, SignatureUploadResponseDto, TemplateUploadResponseDto } from './dto/response-documents.dto';
import { SettingsResponseDto } from './dto/response-settings.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { NUMBERING, SETTINGS_AUDIT } from './settings.constants';
import {
  activeTemplates,
  getSettingsOrThrow,
  mapToSettingsResponse,
  mergeCompany,
  mergeStageProbabilities,
  numberingExamples,
  validateTemplate,
} from './settings.utils';

/** US-00-08 — project settings, document templates and signature image. */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly fileService: FileService,
    private readonly renderer: DocumentRenderService,
  ) {}

  async get(projectId: string): Promise<SettingsResponseDto> {
    return mapToSettingsResponse(await getSettingsOrThrow(this.prisma, projectId));
  }

  async update(projectId: string, dto: UpdateSettingsDto, actor: AuthenticatedUser): Promise<SettingsResponseDto> {
    if (Object.keys(dto).length === 0) throw apiError.badRequest('EMPTY_UPDATE_PAYLOAD');
    const current = await getSettingsOrThrow(this.prisma, projectId);

    const { company, stageProbabilities, ...scalars } = dto;
    const data: Prisma.SettingsUpdateInput = { ...scalars };
    if (company) data.company = mergeCompany(current.company, company);
    if (stageProbabilities) data.stageProbabilities = mergeStageProbabilities(current.stageProbabilities, stageProbabilities);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.settings.update({ where: { projectId }, data });
      await this.audit.log(tx, {
        projectId,
        userId: actor.id,
        action: SETTINGS_AUDIT.UPDATE,
        objectType: AUDIT_OBJECTS.SETTINGS,
        objectId: row.id,
        metadata: { fields: Object.keys(dto) },
      });
      return row;
    });
    return mapToSettingsResponse(updated);
  }

  // ---- documents ------------------------------------------------------------------------

  async documents(projectId: string, actor: AuthenticatedUser): Promise<DocumentsResponseDto> {
    const [templates, signature] = await Promise.all([
      this.prisma.file.findMany({
        where: { projectId, ownerType: FileOwnerType.PROJECT, category: FileCategory.HTML_TEMPLATE },
        orderBy: { uploadedAt: 'desc' },
        select: { id: true, fileName: true, uploadedAt: true, templateType: true },
      }),
      this.findSignatureImage(projectId),
    ]);
    // Initials come from the authenticated principal — no extra query
    const initials = actor.relations.find((r) => r.projectId === projectId)?.initials;
    return {
      templates: activeTemplates(templates),
      signatureImage: signature ? { fileId: signature.id, fileName: signature.fileName, uploadedAt: signature.uploadedAt } : null,
      numbering: numberingExamples(new Date(), initials ?? NUMBERING.FALLBACK_INITIALS),
    };
  }

  /**
   * US-00-08 — prévisualiser un gabarit avant de le publier. Le rendu se fait sur un **jeu de
   * données fictif** (`Exempleville`) : l'administrateur juge sa mise en page sans ouvrir un
   * devis réel. Le cachet du projet, lui, est le vrai — c'est ce qu'il vient vérifier.
   *
   * Sans fichier téléversé, la route prévisualise le gabarit **actif** du projet ; avec un
   * fichier, elle prévisualise **celui-là**, avant même de le publier.
   */
  async previewTemplate(
    projectId: string,
    type: DocumentTemplateType,
    file: UploadedFileLike | undefined,
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const source = file ? file.buffer.toString('utf8') : await this.activeTemplateSource(projectId, type);
    const issues = validateTemplate(source, type);
    if (issues.length) throw withDetails(apiError.badRequest('TEMPLATE_INVALID', issues.join('; ')), issues);

    const buffer = await this.renderer.fromTemplate(source, {
      ...previewQuoteData(),
      signature_image: await this.signatureDataUri(projectId),
    });
    return { buffer, filename: `apercu-gabarit-${type.toLowerCase()}.pdf`, contentType: MIME.PDF };
  }

  /** Le gabarit actif du type : le dernier téléversé (règle du L0). */
  private async activeTemplateSource(projectId: string, type: DocumentTemplateType): Promise<string> {
    const template = await this.prisma.file.findFirst({
      where: {
        projectId,
        ownerType: FileOwnerType.PROJECT,
        category: FileCategory.HTML_TEMPLATE,
        templateType: type,
      },
      orderBy: { uploadedAt: 'desc' },
    });
    if (!template) throw apiError.notFound('TEMPLATE_NOT_CONFIGURED', type);
    return (await this.fileService.getBuffer(template)).toString('utf8');
  }

  /** Le cachet du projet en data URI — vide s'il n'est pas configuré, jamais une erreur. */
  private async signatureDataUri(projectId: string): Promise<string> {
    const signature = await this.findSignatureImage(projectId);
    if (!signature) return '';
    try {
      return dataUri(await this.fileService.getBuffer(signature), signature.mimeType);
    } catch {
      return '';
    }
  }

  /** New active version of a template type; the file is validated (Handlebars + required tags) first. */
  async uploadTemplate(
    projectId: string,
    type: DocumentTemplateType,
    file: UploadedFileLike | undefined,
    actor: AuthenticatedUser,
  ): Promise<TemplateUploadResponseDto> {
    assertFilePresent(file);
    const issues = validateTemplate(file.buffer.toString('utf8'), type);
    if (issues.length) throw withDetails(apiError.badRequest('TEMPLATE_INVALID', issues.join('; ')), issues);

    const saved = await this.fileService.upload({
      projectId,
      ownerType: FileOwnerType.PROJECT,
      ownerId: projectId,
      category: FileCategory.HTML_TEMPLATE,
      templateType: type,
      buffer: file.buffer,
      fileName: file.originalname,
      declaredMimeType: MIME.HTML,
      uploadedBy: actor.id,
    });
    const version = await this.prisma.file.count({
      where: { projectId, ownerType: FileOwnerType.PROJECT, category: FileCategory.HTML_TEMPLATE, templateType: type },
    });
    await this.audit.logNow({
      projectId,
      userId: actor.id,
      action: SETTINGS_AUDIT.TEMPLATE_UPLOAD,
      objectType: AUDIT_OBJECTS.FILE,
      objectId: saved.id,
      metadata: { type, version },
    });
    return { type, version, fileId: saved.id };
  }

  /** Replaces the stamp + signature image (single per project, FileService SIGNATURE_IMAGE rules). */
  async uploadSignatureImage(
    projectId: string,
    file: UploadedFileLike | undefined,
    actor: AuthenticatedUser,
  ): Promise<SignatureUploadResponseDto> {
    assertFilePresent(file);
    const saved = await this.fileService.upload({
      projectId,
      ownerType: FileOwnerType.PROJECT,
      ownerId: projectId,
      category: FileCategory.SIGNATURE_IMAGE,
      buffer: file.buffer,
      fileName: file.originalname,
      declaredMimeType: file.mimetype,
      uploadedBy: actor.id,
    });
    await this.audit.logNow({
      projectId,
      userId: actor.id,
      action: SETTINGS_AUDIT.SIGNATURE_UPDATE,
      objectType: AUDIT_OBJECTS.FILE,
      objectId: saved.id,
    });
    return { fileId: saved.id, fileName: saved.fileName };
  }

  async deleteSignatureImage(projectId: string, actor: AuthenticatedUser): Promise<void> {
    const signature = await this.findSignatureImage(projectId);
    if (!signature) throw apiError.notFound('SIGNATURE_IMAGE_NOT_SET');
    await this.fileService.delete(signature.id, actor);
    await this.audit.logNow({
      projectId,
      userId: actor.id,
      action: SETTINGS_AUDIT.SIGNATURE_DELETE,
      objectType: AUDIT_OBJECTS.FILE,
      objectId: signature.id,
    });
  }

  // ----------------------------------------------------------------------------------------

  private findSignatureImage(projectId: string): Promise<File | null> {
    return this.prisma.file.findFirst({
      where: { projectId, ownerType: FileOwnerType.PROJECT, category: FileCategory.SIGNATURE_IMAGE },
    });
  }
}
