import { ApiProperty } from '@nestjs/swagger';

export class AvatarResponseDto {
  @ApiProperty({ example: 'https://localhost:9010/…', description: 'Presigned URL of the new avatar' })
  avatarUrl: string;
}
