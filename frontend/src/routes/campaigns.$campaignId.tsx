import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/campaigns/$campaignId')({
  head: () => ({ meta: [{ title: 'Campaign | Career Workbench' }] }),
  component: lazyRouteComponent(() => import('#/pages/campaign-page'), 'CampaignRoutePage'),
})
