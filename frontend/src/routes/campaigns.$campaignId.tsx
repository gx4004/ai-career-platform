import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'
import { isR13CampaignsEnabled } from '#/lib/flags/featureFlags'
import { requireEnabledOutcome } from '#/lib/flags/outcomeGuard'

export const Route = createFileRoute('/campaigns/$campaignId')({
  beforeLoad: () => requireEnabledOutcome(isR13CampaignsEnabled()),
  head: () => ({ meta: [{ title: 'Campaign | Career Workbench' }] }),
  component: lazyRouteComponent(() => import('#/pages/campaign-page'), 'CampaignRoutePage'),
})
