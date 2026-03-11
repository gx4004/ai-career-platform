import { useSessionContext } from '#/lib/auth/session'

export function useSession() {
  return useSessionContext()
}
