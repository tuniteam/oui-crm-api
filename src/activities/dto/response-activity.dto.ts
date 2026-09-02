import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ActivityStatus } from '@prisma/client';
import { PaginationMetaDto } from '@/common/dto/pagination.dto';
import { ReferenceRefDto, UserRefDto } from '@/organizations/dto';
import { AGENDA_KINDS, AgendaKind } from '../activities.constants';

export class ActivityOrgRefDto {
  @ApiProperty({ example: 'cmtj…' })
  id: string;

  @ApiProperty({ example: 'Commune de Caen' })
  name: string;
}

export class ActivityContactRefDto {
  @ApiProperty({ example: 'cmtj…' })
  id: string;

  @ApiProperty({ example: 'Hélène Lemarchand' })
  fullName: string;
}

export class ActivityCampaignRefDto {
  @ApiProperty({ example: 'cmtj…' })
  id: string;

  @ApiProperty({ example: 'Rentrée 89' })
  name: string;
}

export class ActivityDto {
  @ApiProperty({ example: 'cmtj…' })
  id: string;

  @ApiProperty({ type: ActivityOrgRefDto })
  organization: ActivityOrgRefDto;

  @ApiPropertyOptional({ type: ActivityContactRefDto, nullable: true })
  contact: ActivityContactRefDto | null;

  @ApiProperty({ type: UserRefDto, description: 'The owner of the activity' })
  user: UserRefDto;

  @ApiProperty({ type: ReferenceRefDto, description: 'ACTIVITY_TYPE key with its label' })
  type: ReferenceRefDto;

  @ApiProperty({ example: '2026-09-15', description: 'YYYY-MM-DD' })
  date: string;

  @ApiPropertyOptional({ example: '14:30', nullable: true, description: 'Local wall-clock, displayed as-is' })
  time: string | null;

  @ApiPropertyOptional({ example: 90, nullable: true })
  durationMin: number | null;

  @ApiPropertyOptional({ example: 'Mairie de Caen', nullable: true })
  location: string | null;

  @ApiProperty({ enum: ActivityStatus, example: ActivityStatus.PLANNED })
  status: ActivityStatus;

  @ApiPropertyOptional({ example: null, nullable: true })
  report: string | null;

  @ApiPropertyOptional({ type: ReferenceRefDto, nullable: true, description: 'ACTIVITY_RESULT key, set at completion' })
  result: ReferenceRefDto | null;

  @ApiPropertyOptional({ type: ActivityCampaignRefDto, nullable: true })
  campaign: ActivityCampaignRefDto | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  completedAt: Date | null;
}

export class ActivitiesListResponseDto {
  @ApiProperty({ type: [ActivityDto], description: 'Newest date first' })
  data: ActivityDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}

export class AgendaItemDto {
  @ApiProperty({ enum: AGENDA_KINDS, example: 'ACTIVITY' })
  kind: AgendaKind;

  @ApiProperty({ example: 'cmtj…' })
  id: string;

  @ApiProperty({ example: '2026-09-15' })
  date: string;

  @ApiPropertyOptional({ example: '14:30', nullable: true })
  time: string | null;

  @ApiProperty({ example: 'RDV physique', description: 'What the slot is (type label)' })
  title: string;

  @ApiPropertyOptional({ example: 'Hélène Lemarchand — Mairie de Caen, salle 2', nullable: true })
  subtitle: string | null;

  @ApiProperty({ type: ActivityOrgRefDto })
  organization: ActivityOrgRefDto;

  @ApiPropertyOptional({ type: UserRefDto, nullable: true })
  user: UserRefDto | null;

  @ApiProperty({ example: 'PLANNED' })
  status: string;

  @ApiProperty({ example: false, description: 'PLANNED with a past date' })
  isLate: boolean;
}

export class AgendaResponseDto {
  @ApiProperty({ type: [AgendaItemDto], description: 'Sorted by date then time' })
  data: AgendaItemDto[];
}
