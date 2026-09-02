// ============================================
// OUI-CRM - Campaigns constants (US-01-11)
// ============================================

import { CampaignStatus } from '@prisma/client';

/** Audit actions of the module (AUDIT_OBJECTS.CAMPAIGN). */
export const CAMPAIGNS_AUDIT = {
  CREATE: 'campaign.create',
  UPDATE: 'campaign.update',
  STATUS: 'campaign.status',
  DELETE: 'campaign.delete',
  ORGANIZATIONS_ADD: 'campaign.organizations.add',
  ORGANIZATIONS_REMOVE: 'campaign.organizations.remove',
} as const;

/** Lifecycle: draft → run → close, and a closed campaign can be reopened. */
export const CAMPAIGN_TRANSITIONS: Record<CampaignStatus, readonly CampaignStatus[]> = {
  [CampaignStatus.DRAFT]: [CampaignStatus.ACTIVE],
  [CampaignStatus.ACTIVE]: [CampaignStatus.CLOSED],
  [CampaignStatus.CLOSED]: [CampaignStatus.ACTIVE],
};

export const CAMPAIGN_NAME_MAX_LENGTH = 150;
export const CAMPAIGN_DESCRIPTION_MAX_LENGTH = 1000;
/** One targeting call at a time stays reviewable; US-01-05 handles the big selections. */
export const CAMPAIGN_TARGET_BATCH_MAX = 500;
