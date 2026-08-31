import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FeatureCode, OutOfScopeAccess, ScopeType } from '@prisma/client';
import { ContactType } from '@/common/enums/contact.enum';
import { LegalDocument } from '@/common/legal/legal.constants';

export class MePermissionDto {
  @ApiProperty({ example: 'quotes:create' })
  code: string;

  @ApiProperty({ enum: ScopeType, example: ScopeType.OWN })
  scope: ScopeType;

  @ApiProperty({ enum: ['ROLE', 'OVERRIDE'], example: 'ROLE', description: 'OVERRIDE = corrected by a user override' })
  source: 'ROLE' | 'OVERRIDE';
}

export class MeScopeDto {
  @ApiProperty({ example: 'Normandie' })
  name: string;

  @ApiProperty({ type: [String], example: ['Normandie'] })
  regions: string[];

  @ApiProperty({ type: [String], example: ['14', '27', '50', '61', '76'] })
  departments: string[];

  @ApiProperty({ example: false, description: 'true = only the records the user is assigned to' })
  portfolioOnly: boolean;
}

export class MeRoleRelationshipDto {
  @ApiProperty({ example: 'SALES_REP' })
  roleCode: string;

  @ApiPropertyOptional({ example: 'cmthas5lv009z5qp4tyv8k87s', nullable: true, description: 'null = backoffice relation' })
  projectId: string | null;

  @ApiPropertyOptional({ example: 'Périscolia', nullable: true })
  projectName: string | null;

  @ApiPropertyOptional({ example: 'periscolia', nullable: true })
  projectSlug: string | null;

  @ApiProperty({ example: 1 })
  displayOrder: number;

  @ApiProperty({ enum: OutOfScopeAccess, example: OutOfScopeAccess.RESTRICTED })
  outOfScopeAccess: OutOfScopeAccess;

  @ApiProperty({ type: [MePermissionDto], description: 'Effective permissions, already corrected by overrides' })
  permissions: MePermissionDto[];

  @ApiProperty({ enum: FeatureCode, isArray: true, description: 'Features enabled on the project', example: ['SALES'] })
  modules: FeatureCode[];

  @ApiPropertyOptional({ type: MeScopeDto, nullable: true })
  scope: MeScopeDto | null;

  @ApiPropertyOptional({ example: null, nullable: true, description: 'Last day of validity (external accounts)' })
  expiresAt: Date | null;
}

export class LegalDocumentToAcceptDto {
  @ApiProperty({ enum: LegalDocument, example: LegalDocument.CGU })
  code: LegalDocument;

  @ApiProperty({ example: 1 })
  version: number;

  @ApiProperty({ example: 'https://oui-crm.example/cgu' })
  url: string;
}

/** SPEC-06 §6 — single profile read after login (US-00-03). */
export class MeResponseDto {
  @ApiProperty({ example: 'cmthas5q500d85qp4nsdjto02', description: 'User identifier' })
  contactId: string;

  @ApiProperty({ example: 'email.ouicrm+wiem@gmail.com' })
  email: string;

  @ApiProperty({ example: 'Wiem' })
  firstName: string;

  @ApiProperty({ example: 'Bousaid' })
  lastName: string;

  @ApiPropertyOptional({ example: '0601020304', nullable: true })
  phone: string | null;

  @ApiPropertyOptional({ example: 'WB', nullable: true, description: 'Initials of the first relation' })
  initials: string | null;

  @ApiPropertyOptional({ example: 'https://localhost:9010/…', nullable: true, description: 'Presigned avatar URL' })
  avatarUrl: string | null;

  @ApiProperty({ enum: ContactType, example: ContactType.PROJECT })
  contactType: ContactType;

  @ApiProperty({ type: [MeRoleRelationshipDto], description: 'Active, non-expired relations only' })
  roleRelationships: MeRoleRelationshipDto[];

  @ApiProperty({ example: false, description: 'Always false for backoffice users' })
  legalReacceptanceRequired: boolean;

  @ApiProperty({ type: [LegalDocumentToAcceptDto] })
  legalDocumentsToAccept: LegalDocumentToAcceptDto[];
}
