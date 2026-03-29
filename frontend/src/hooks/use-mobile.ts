import { useBreakpoint } from './use-breakpoint'

const MOBILE_BREAKPOINT = 768

export { MOBILE_BREAKPOINT }

export function useIsMobile() {
  const bp = useBreakpoint()
  return bp === 'mobile'
}
