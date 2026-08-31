import { SetMetadata } from '@nestjs/common';
import { FeatureCode } from '@prisma/client';

export const REQUIRES_FEATURE_KEY = 'requires_feature';

/**
 * Marks a route (or controller) as available only when the project has the feature enabled
 * (ProjectFeature). Checked by RequiresFeatureGuard, after ProjectGuard.
 */
export const RequiresFeature = (feature: FeatureCode) => SetMetadata(REQUIRES_FEATURE_KEY, feature);
