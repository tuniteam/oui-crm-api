import { SetMetadata } from '@nestjs/common';

export const PROJECT_SCOPED_KEY = 'project_scoped';

/** The route requires the x-project-id header, validated by ProjectGuard (SPEC-02 §4.1). */
export const ProjectScoped = () => SetMetadata(PROJECT_SCOPED_KEY, true);
