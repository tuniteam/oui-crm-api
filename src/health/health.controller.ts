import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@/auth/decorators/public.decorator';
import { ApiMessages } from '@/common/messages';

const swagger = ApiMessages.swagger;

@ApiTags(swagger.health.tag)
@Controller('health')
export class HealthController {
  @Get()
  @Public()
  @ApiOperation(swagger.health.check)
  check(): { status: string } {
    return { status: 'ok' };
  }
}
