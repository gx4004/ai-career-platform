import { getRouteApi } from '@tanstack/react-router'
import { ApplicationPage } from '#/components/applications/ApplicationPage'

const applicationRoute = getRouteApi('/campaigns/$campaignId')

export function ApplicationRoutePage() {
  const { campaignId } = applicationRoute.useParams()
  return <ApplicationPage applicationId={campaignId} />
}
