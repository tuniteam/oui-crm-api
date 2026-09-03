import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthenticatedUser } from '@/auth/interfaces/authenticated-user.interface';
import { findPermission } from '@/auth/utils/permissions.util';
import { ScopeService } from '@/scopes/scope.service';
import { loadScopeContext } from '@/scopes/scopes.utils';
import { PrismaService } from '@/prisma/prisma.service';
import { SearchContactDto, SearchOrgDto, SearchResponseDto } from './dto/search.dto';
import { SEARCH_LIMIT } from './search.constants';

/**
 * US-01-12 — one query, every object type the caller may read: a type's key is present only
 * with its read permission (the front renders what it receives, it never decides). Same
 * visibility rules as the lists: NONE-hidden records are absent, RESTRICTED records appear
 * with their restricted columns; a contact is only reachable through a FULL record
 * (US-01-04). Quotes and contracts are in the contract already and stay empty until L2/L3.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: ScopeService,
  ) {}

  async search(projectId: string, q: string, user: AuthenticatedUser): Promise<SearchResponseDto> {
    const term = q.trim();
    const ctx = await loadScopeContext(this.prisma, user, projectId);
    const response: SearchResponseDto = {};

    if (findPermission(user, projectId, 'organizations:read')) {
      response.organizations = await this.searchOrganizations(projectId, term, ctx);
    }
    if (findPermission(user, projectId, 'contacts:read')) {
      response.contacts = await this.searchContacts(projectId, term, ctx);
    }
    if (findPermission(user, projectId, 'quotes:read')) response.quotes = [];
    if (findPermission(user, projectId, 'contracts:read')) response.contracts = [];
    return response;
  }

  private async searchOrganizations(
    projectId: string,
    term: string,
    ctx: Awaited<ReturnType<typeof loadScopeContext>>,
  ): Promise<SearchOrgDto[]> {
    const where: Prisma.OrganizationWhereInput = {
      projectId,
      deletedAt: null,
      OR: [
        { name: { contains: term, mode: 'insensitive' } },
        { city: { contains: term, mode: 'insensitive' } },
        { siret: { contains: term.replace(/\s/g, '') } },
      ],
    };
    if (ctx.outOfScopeAccess === 'NONE') {
      const scopeWhere = this.scopeService.whereVisible(ctx);
      if (Object.keys(scopeWhere).length) where.AND = [scopeWhere];
    }
    const rows = await this.prisma.organization.findMany({
      where,
      orderBy: { name: 'asc' },
      take: SEARCH_LIMIT,
    });
    return rows.map((row) => this.toOrgRef(row, this.scopeService.access(ctx, row) as 'FULL' | 'RESTRICTED'));
  }

  private async searchContacts(
    projectId: string,
    term: string,
    ctx: Awaited<ReturnType<typeof loadScopeContext>>,
  ): Promise<SearchContactDto[]> {
    const rows = await this.prisma.contact.findMany({
      where: {
        projectId,
        deletedAt: null,
        organization: { deletedAt: null },
        OR: [
          { firstName: { contains: term, mode: 'insensitive' } },
          { lastName: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
        ],
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      include: { organization: true },
      // A contact lives behind FULL access only: fetch wider, filter by scope, then cut
      take: SEARCH_LIMIT * 3,
    });
    return rows
      .filter((c) => this.scopeService.access(ctx, c.organization) === 'FULL')
      .slice(0, SEARCH_LIMIT)
      .map((c) => ({
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        role: c.role,
        email: c.email,
        organization: this.toOrgRef(c.organization, 'FULL'),
      }));
  }

  private toOrgRef(
    row: { id: string; name: string; type: string; city: string | null; department: string; salesStatus: string },
    access: 'FULL' | 'RESTRICTED',
  ): SearchOrgDto {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      city: row.city,
      department: row.department,
      salesStatus: row.salesStatus,
      access,
    };
  }
}
