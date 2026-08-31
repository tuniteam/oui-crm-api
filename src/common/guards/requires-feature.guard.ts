import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeatureCode } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { apiError } from '@/common/api-error';
import { REQUIRES_FEATURE_KEY } from '@/common/decorators/requires-feature.decorator';
import { RequestWithScope } from '@/auth/types/request-with-scope.interface';

/**
 * Enforces @RequiresFeature(code): the current project (req.projectId, set by ProjectGuard)
 * must have the feature enabled. Placed after ProjectGuard in @UseGuards.
 */
@Injectable()
export class RequiresFeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeature = this.reflector.getAllAndOverride<FeatureCode | undefined>(
      REQUIRES_FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredFeature) return true;

    const req = context.switchToHttp().getRequest<RequestWithScope>();
    const projectId = req.projectId;

    if (!projectId) return true; // ProjectGuard is responsible for the header

    const feature = await this.prisma.projectFeature.findUnique({
      where: { projectId_feature: { projectId, feature: requiredFeature } },
    });

    if (!feature || !feature.enabled) {
      throw apiError.forbidden('FEATURE_NOT_ENABLED', requiredFeature);
    }

    return true;
  }
}
