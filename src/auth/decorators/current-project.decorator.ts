import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Injects req.projectId, set by ProjectGuard on @ProjectScoped() routes. */
export const CurrentProjectId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => ctx.switchToHttp().getRequest().projectId,
);
