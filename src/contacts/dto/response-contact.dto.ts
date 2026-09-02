import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ContactDto {
  @ApiProperty({ example: 'cmtj…' })
  id: string;

  @ApiPropertyOptional({ example: 'Mme', nullable: true })
  civility: string | null;

  @ApiProperty({ example: 'Hélène' })
  firstName: string;

  @ApiProperty({ example: 'Lemarchand' })
  lastName: string;

  @ApiPropertyOptional({ example: 'DGS', nullable: true })
  role: string | null;

  @ApiPropertyOptional({ example: 'h.lemarchand@caen.fr', nullable: true })
  email: string | null;

  @ApiPropertyOptional({ example: '02 31 30 41 12', nullable: true })
  phone: string | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  mobile: string | null;

  @ApiProperty({ example: true, description: 'At most one per organization, enforced by the database' })
  isPrimary: boolean;

  @ApiProperty({ example: false, description: 'Excluded from campaigns' })
  optOut: boolean;

  @ApiPropertyOptional({ example: null, nullable: true })
  notes: string | null;

  @ApiProperty({ example: false, description: 'Extracted from a note at import time — to be verified by a human' })
  extractedFromNote: boolean;

  @ApiProperty({ example: '2026-09-02T10:00:00.000Z' })
  updatedAt: Date;
}

export class ContactsListResponseDto {
  @ApiProperty({ type: [ContactDto], description: 'Primary first, then by last name' })
  data: ContactDto[];
}
