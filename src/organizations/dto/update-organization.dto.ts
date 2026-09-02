import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateOrganizationDto } from './create-organization.dto';

/**
 * Every field optional, minus the ones a PATCH must never carry:
 * - `salesStatus` changes only through POST /organizations/:id/sales-status (US-01-10) or an
 *   activity automation (US-01-08) — a PATCH on a status is forbidden by the project rules;
 * - `customerStatus` follows the contract lifecycle (L3), never a manual edit;
 * - `force` only makes sense when creating a possible duplicate.
 */
export class UpdateOrganizationDto extends PartialType(
  OmitType(CreateOrganizationDto, ['salesStatus', 'customerStatus', 'force'] as const),
) {}
