import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { IsCuid } from '@/common/decorators/is-cuid.decorator';
import { DAY_PATTERN } from '@/common/utils/date.utils';

export class AgendaQueryDto {
  @ApiProperty({ example: '2026-09-01', description: 'First day, inclusive — one request per displayed month' })
  @Matches(DAY_PATTERN)
  from: string;

  @ApiProperty({ example: '2026-09-30', description: 'Last day, inclusive' })
  @Matches(DAY_PATTERN)
  to: string;

  @ApiPropertyOptional({ example: 'cmth…', description: 'Another member\'s agenda — ignored for an OWN-scoped caller' })
  @IsOptional()
  @IsCuid()
  userId?: string;

  @ApiPropertyOptional({
    example: 'ACTIVITY,TRAINING',
    description: 'Comma-separated kinds; only ACTIVITY answers at L1, the contract already accepts the others',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  kinds?: string;
}
