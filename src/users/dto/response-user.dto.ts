import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationMetaDto } from '@/common/dto/pagination.dto';
import { MePermissionDto } from '@/profile/dto/me-response.dto';
import { ProjectUserStatus } from '../users.constants';

export class UserScopeRefDto {
  @ApiProperty({ example: 'cmth…' })
  id: string;

  @ApiProperty({ example: 'Normandie' })
  name: string;
}

export class OverridesCountDto {
  @ApiProperty({ example: 1 })
  added: number;

  @ApiProperty({ example: 0 })
  removed: number;
}

export class UserListItemResponseDto {
  @ApiProperty({ example: 'cmth…', description: 'User identifier' })
  id: string;

  @ApiProperty({ example: 'email.ouicrm+wiem@gmail.com' })
  email: string;

  @ApiProperty({ example: 'Wiem' })
  firstName: string;

  @ApiProperty({ example: 'Bousaid' })
  lastName: string;

  @ApiProperty({ example: 'WB' })
  initials: string;

  @ApiProperty({ enum: ProjectUserStatus, example: ProjectUserStatus.ACTIVE, description: 'Account status, or SUSPENDED when the assignment is suspended' })
  status: ProjectUserStatus;

  @ApiProperty({ example: 'SALES_REP' })
  roleCode: string;

  @ApiProperty({ example: 'Sales representative' })
  roleLabel: string;

  @ApiPropertyOptional({ type: UserScopeRefDto, nullable: true })
  scope: UserScopeRefDto | null;

  @ApiPropertyOptional({ example: null, nullable: true, description: 'Last day of validity' })
  expiresAt: Date | null;

  @ApiProperty({ example: false, description: 'Derived: expiresAt is set' })
  isExternal: boolean;

  @ApiProperty({ type: OverridesCountDto })
  overridesCount: OverridesCountDto;

  @ApiPropertyOptional({ example: null, nullable: true })
  lastLoginAt: Date | null;
}

export class UserListResponseDto {
  @ApiProperty({ type: [UserListItemResponseDto] })
  data: UserListItemResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}

export class UserDetailResponseDto extends UserListItemResponseDto {
  @ApiPropertyOptional({ example: '0601020304', nullable: true })
  phone: string | null;

  @ApiProperty({ type: [MePermissionDto], description: 'Effective permissions on this project (overrides applied)' })
  permissions: MePermissionDto[];
}
