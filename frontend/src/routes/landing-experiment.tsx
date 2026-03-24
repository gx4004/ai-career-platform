import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/landing-experiment')({
  beforeLoad: () => {
    throw redirect({ to: '/' })
  },
})
