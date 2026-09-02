import { Campaign, Prisma, PrismaClient } from '@prisma/client';
import { apiError } from '@/common/api-error';
import { formatDateField, parseDayOrThrow } from '@/common/utils/date.utils';
import { UserWithInitials } from '@/audit-log/audit-log-labels';
import { fullName } from '@/common/utils/user.utils';
import { CampaignDto, CampaignResultsDto } from './dto/campaign.dto';

type Db = Pick<PrismaClient, 'campaign'> | Prisma.TransactionClient;

export async function getCampaignOrThrow(db: Db, id: string, projectId: string): Promise<Campaign> {
  const campaign = await db.campaign.findFirst({ where: { id, projectId } });
  if (!campaign) throw apiError.notFound('CAMPAIGN_NOT_FOUND', id);
  return campaign;
}

/** startDate/endDate come as YYYY-MM-DD; an inverted period is refused. */
export function parseCampaignPeriod(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
): { startDate?: Date | null; endDate?: Date | null } {
  const out: { startDate?: Date | null; endDate?: Date | null } = {};
  if (startDate !== undefined) out.startDate = startDate ? parseDayOrThrow(startDate) : null;
  if (endDate !== undefined) out.endDate = endDate ? parseDayOrThrow(endDate) : null;
  return out;
}

export function assertPeriodValid(startDate: Date | null, endDate: Date | null): void {
  if (startDate && endDate && startDate > endDate) throw apiError.badRequest('INVALID_DATA');
}

export function mapToCampaign(
  campaign: Campaign,
  owner: UserWithInitials | undefined,
  organizationsCount: number,
  activities: number,
): CampaignDto {
  return {
    id: campaign.id,
    name: campaign.name,
    description: campaign.description,
    status: campaign.status,
    owner: owner ? { id: owner.id, fullName: fullName(owner), initials: owner.initials ?? null } : null,
    startDate: campaign.startDate ? formatDateField(campaign.startDate) : null,
    endDate: campaign.endDate ? formatDateField(campaign.endDate) : null,
    criteria: (campaign.criteria as Record<string, unknown>) ?? {},
    organizationsCount,
    results: campaignResults(activities),
  };
}

/** Only `activities` has a source at L1; the L2 counters are wired later, same contract. */
export function campaignResults(activities: number): CampaignResultsDto {
  return { activities, opportunities: 0, quotes: 0, signed: 0 };
}
