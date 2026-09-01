import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaDto } from '@/common/dto/pagination.dto';
import { AUDIT_OBJECT_TYPES } from '../audit-log.constants';

export class AuditUserRefDto {
  @ApiProperty({ example: 'cmth…' })
  id: string;

  @ApiProperty({ example: 'Abdoulaye' })
  firstName: string;

  @ApiProperty({ example: 'Sow' })
  lastName: string;

  @ApiProperty({ example: 'AS', nullable: true, description: 'Initials on this project; null if no longer assigned' })
  initials: string | null;
}

export class AuditLogItemDto {
  @ApiProperty({ example: 'cmth…' })
  id: string;

  @ApiProperty({ example: '2026-08-31T07:33:00.000Z' })
  createdAt: Date;

  @ApiProperty({ type: AuditUserRefDto, nullable: true, description: 'null = system job or deleted account' })
  user: AuditUserRefDto | null;

  @ApiProperty({ example: 'user.suspend', description: 'object.verb code' })
  action: string;

  @ApiProperty({ enum: AUDIT_OBJECT_TYPES, nullable: true, example: 'User' })
  objectType: string | null;

  @ApiProperty({ example: 'cmth…', nullable: true })
  objectId: string | null;

  @ApiProperty({ example: 'Wiem Bousaid (WB)', nullable: true, description: 'Resolved server-side; null when the object no longer exists' })
  objectLabel: string | null;

  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true, example: { fields: ['roleCode'] } })
  metadata: Record<string, unknown> | null;
}

export class AuditLogListResponseDto {
  @ApiProperty({ type: [AuditLogItemDto] })
  data: AuditLogItemDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
