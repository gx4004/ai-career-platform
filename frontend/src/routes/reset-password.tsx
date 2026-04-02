import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'
import { z } from 'zod'

const searchSchema = z.object({
  token: z.string().optional(),
})

export const Route = createFileRoute('/reset-password')({
  validateSearch: searchSchema,
  head: () => ({
    meta: [{ title: 'Reset Password | Career Workbench' }],
  }),
  component: lazyRouteComponent(() => import('#/pages/reset-password-page'), 'ResetPasswordPage'),
})
