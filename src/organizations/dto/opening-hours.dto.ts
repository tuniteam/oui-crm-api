import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** Days of the week, in display order. A closed day is absent from `days`, never empty. */
export const OPENING_DAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;

export type OpeningDay = (typeof OPENING_DAYS)[number];

/** "HH:mm-HH:mm", 24-hour clock. */
export const OPENING_SLOT_PATTERN = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/;

export class OpeningHoursDayDto {
  @ApiProperty({ enum: OPENING_DAYS, example: 'MONDAY' })
  @IsIn(OPENING_DAYS)
  day: OpeningDay;

  @ApiProperty({
    example: ['08:30-12:00', '13:30-17:00'],
    description: 'One or two slots, morning then afternoon',
  })
  @IsArray()
  // Un jour listé est un jour ouvert : les jours fermés sont absents de `days` (SPEC-16 D5).
  @ArrayNotEmpty()
  @ArrayMaxSize(2)
  @Matches(OPENING_SLOT_PATTERN, { each: true })
  slots: string[];
}

/**
 * Town-hall opening hours (US-01-15). Filled by the territory import from the public
 * directory, then editable like any other field. `GET /organizations?openOn=` filters on it
 * (SPEC-16). A day appears **at most once**: closed days are absent, and the import keeps the
 * most complete declaration when the source repeats a day.
 */
export class OpeningHoursDto {
  @ApiProperty({
    type: [OpeningHoursDayDto],
    description: 'Closed days are absent; a day appears at most once. Send null to clear the hours.',
  })
  @IsArray()
  // Un objet qui ne déclare aucun jour ne dit rien : c'est `null` qu'il faut envoyer.
  @ArrayNotEmpty()
  @ArrayMaxSize(OPENING_DAYS.length)
  @ValidateNested({ each: true })
  @Type(() => OpeningHoursDayDto)
  days: OpeningHoursDayDto[];

  @ApiPropertyOptional({ example: "Le samedi matin, permanence de l'état-civil de 8:00 à 12:00" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
