import { createFileRoute } from '@tanstack/react-router'
import { LoginPage } from '#/pages/login-page'

export const Route = createFileRoute('/login')({
  head: () => ({
    meta: [{ title: 'Sign in | Career Workbench' }],
  }),
  component: LoginPage,
})
