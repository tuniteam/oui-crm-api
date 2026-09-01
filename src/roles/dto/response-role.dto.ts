import { ApiProperty } from '@nestjs/swagger';
import { OutOfScopeAccess, ScopeType } from '@prisma/client';

export class RoleGrantResponseDto {
  @ApiProperty({ example: 'quotes:read' })
  code: string;

  @ApiProperty({ enum: ScopeType, example: ScopeType.OWN })
  scope: ScopeType;
}

export class RoleResponseDto {
  @ApiProperty({ example: 'cmth…' })
  id: string;

  @ApiProperty({ example: 'SALES_REP' })
  code: string;

  @ApiProperty({ example: 'Sales representative' })
  label: string;

  @ApiProperty({ example: true, description: 'System roles are read-only; duplicate them to adapt' })
  isSystem: boolean;

  @ApiProperty({ enum: OutOfScopeAccess, example: OutOfScopeAccess.RESTRICTED })
  outOfScopeAccess: OutOfScopeAccess;

  @ApiProperty({ type: [RoleGrantResponseDto] })
  permissions: RoleGrantResponseDto[];

  @ApiProperty({ example: 3, description: 'Active assignments of this role on the current project' })
  usersCount: number;
}

export class RolesListResponseDto {
  @ApiProperty({ type: [RoleResponseDto] })
  data: RoleResponseDto[];
}

export class PermissionItemDto {
  @ApiProperty({ example: 'quotes:validate' })
  code: string;

  @ApiProperty({ example: 'quotes' })
  module: string;

  @ApiProperty({ example: 'validate' })
  action: string;

  @ApiProperty({ example: 'Validate quotes' })
  label: string;
}

export class PermissionsListResponseDto {
  @ApiProperty({ type: [PermissionItemDto] })
  data: PermissionItemDto[];
}
