import { getRouteApi } from '@tanstack/react-router'
import { CampaignPage } from '#/components/campaigns/CampaignPage'

const campaignRoute = getRouteApi('/campaigns/$campaignId')

export function CampaignRoutePage() {
  const { campaignId } = campaignRoute.useParams()
  return <CampaignPage campaignId={campaignId} />
}
