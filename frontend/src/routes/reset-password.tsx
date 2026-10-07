import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { ResetPasswordPage } from '#/pages/reset-password-page'

const searchSchema = z.object({
  token: z.string().optional(),
})

export const Route = createFileRoute('/reset-password')({
  validateSearch: searchSchema,
  head: () => ({
    meta: [{ title: 'Reset password | Career Workbench' }],
  }),
  component: ResetPasswordPage,
})
