import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/login')({
  head: () => ({
    meta: [{ title: 'Sign In | Career Workbench' }],
  }),
  component: lazyRouteComponent(() => import('#/pages/login-page'), 'LoginPage'),
})
