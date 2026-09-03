import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PROJECT_ID_HEADER } from '@/auth/auth.constants';
import { CurrentProjectId } from '@/auth/decorators/current-project.decorator';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import { ProjectScoped } from '@/auth/decorators/project-scoped.decorator';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guards';
import { PermissionsGuard } from '@/auth/guards/permissions.guard';
import { ProjectGuard } from '@/auth/guards/project.guard';
import { AuthenticatedUser } from '@/auth/interfaces/authenticated-user.interface';
import { SWAGGER_BEARER_AUTH } from '@/common/constants/app.constants';
import { ApiAuthResponses } from '@/common/decorators';
import { ApiMessages } from '@/common/messages';
import { SearchQueryDto, SearchResponseDto } from './dto/search.dto';
import { SearchService } from './search.service';

const swagger = ApiMessages.swagger;

/**
 * US-01-12 — global search. No `@Permissions` on purpose: the permission is per returned
 * TYPE (a type's key is present only with its read permission), asserted by the service.
 */
@ApiTags(swagger.search.tag)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@ApiAuthResponses()
@UseGuards(JwtAuthGuard, ProjectGuard, PermissionsGuard)
@ProjectScoped()
@ApiHeader({ name: PROJECT_ID_HEADER, description: swagger.projectIdHeaderDesc, required: true })
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOperation(swagger.search.global)
  @ApiOkResponse({ type: SearchResponseDto })
  search(
    @CurrentProjectId() projectId: string,
    @Query() query: SearchQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SearchResponseDto> {
    return this.searchService.search(projectId, query.q, user);
  }
}
