import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationMetaDto } from '@/common/dto/pagination.dto';
import { ProjectUserStatus } from '@/users/users.constants';

export class BackofficeRoleDto {
  @ApiProperty({ example: 'SUPER_ADMIN' })
  code: string;

  @ApiProperty({ example: 'Platform administrator' })
  label: string;
}

export class BackofficeRolesResponseDto {
  @ApiProperty({ type: [BackofficeRoleDto] })
  data: BackofficeRoleDto[];
}

export class BackofficeUserResponseDto {
  @ApiProperty({ example: 'cmth…', description: 'User identifier' })
  id: string;

  @ApiProperty({ example: 'email.ouicrm+superadmin@gmail.com' })
  email: string;

  @ApiProperty({ example: 'Super' })
  firstName: string;

  @ApiProperty({ example: 'Admin' })
  lastName: string;

  @ApiProperty({ enum: ProjectUserStatus, example: ProjectUserStatus.ACTIVE, description: 'Account status, or SUSPENDED when the backoffice access is suspended' })
  status: ProjectUserStatus;

  @ApiProperty({ example: 'SUPER_ADMIN' })
  roleCode: string;

  @ApiProperty({ example: 'Platform administrator' })
  roleLabel: string;

  @ApiPropertyOptional({ example: null, nullable: true })
  lastLoginAt: Date | null;

  @ApiProperty({ example: '2026-09-01T10:00:00.000Z' })
  createdAt: Date;
}

export class BackofficeUserListResponseDto {
  @ApiProperty({ type: [BackofficeUserResponseDto] })
  data: BackofficeUserResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
