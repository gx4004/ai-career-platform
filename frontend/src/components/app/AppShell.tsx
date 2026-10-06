import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { ErrorBoundary } from '#/components/app/ErrorBoundary'
import { AppSidebar } from '#/components/app/AppSidebar'
import { AuthDialogMount } from '#/components/app/AuthDialogMount'
import { CommandPalette } from '#/components/app/CommandPalette'
import { MobileNav } from '#/components/app/MobileNav'
import { ServiceBanner } from '#/components/app/ServiceBanner'
import { Topbar } from '#/components/app/Topbar'
import { Button, ToastProvider, TooltipProvider } from '#/components/kit'
import { SidebarInset, SidebarProvider } from '#/components/ui/sidebar'
import { isPublicRoute } from '#/lib/navigation/publicRoutes'
import { useKnownBreakpoint } from '#/hooks/use-breakpoint'
import { cn } from '#/lib/utils'

const MAIN_ID = 'main-content'

/** Routes that want the 76px icon rail instead of the full sidebar (CV Studio: the paper is the loudest object). */
const RAIL_ROUTE_PREFIXES = ['/cv-studio']

/** Whichever element is the page's main landmark: pages and the fallback wrapper do not all carry the id. */
function focusMain(event: React.MouseEvent<HTMLAnchorElement>) {
  const main =
    document.getElementById(MAIN_ID) ?? document.querySelector<HTMLElement>('.app-content main, .app-content [role="main"]')
  if (!main) return
  event.preventDefault()
  if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1')
  main.focus()
}

/**
 * Pages own the page's one <main> (kit Page, PageFrame). A page, or an error or 404 screen, that renders
 * none would leave the app without a main landmark and the skip link without a target, so the content
 * wrapper steps in as the landmark until a page brings its own. The wrapper never becomes a second one.
 */
function useNeedsMainLandmark() {
  const ref = useRef<HTMLDivElement | null>(null)
  const [needsMain, setNeedsMain] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    let frame = 0
    const check = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setNeedsMain(!element.querySelector('main, [role="main"]')))
    }
    check()
    const observer = new MutationObserver(check)
    observer.observe(element, { childList: true, subtree: true })
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [])

  return [ref, needsMain] as const
}

function AppContent({ children, className }: { children: ReactNode; className?: string }) {
  const [ref, needsMain] = useNeedsMainLandmark()
  return (
    <div
      ref={ref}
      className={cn('app-content', className)}
      {...(needsMain ? { role: 'main', id: MAIN_ID, tabIndex: -1 } : {})}
    >
      <ErrorBoundary>{children}</ErrorBoundary>
    </div>
  )
}

function SkipLink() {
  return (
    <Button asChild className="app-skip-link">
      <a href={`#${MAIN_ID}`} onClick={focusMain}>
        Skip to main content
      </a>
    </Button>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  // null while the server renders and the page hydrates: every layout part is rendered then and CSS picks
  // (styles/shell.css hides the sidebar below 640px and the top bar and tab tray above), so a phone never
  // paints the desktop shell first. Once the width is known, only the parts that layout uses stay mounted.
  const bp = useKnownBreakpoint()
  const isShellless = isPublicRoute(pathname)
  const wantsRail = RAIL_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))

  if (isShellless) {
    return (
      <TooltipProvider delayDuration={120}>
        <ToastProvider>
          <ErrorBoundary>
            <ServiceBanner />
            {children}
            {/* /login is the sign-in form already: a session-expiry dialog on top would be a second, identical one. */}
            {pathname === '/login' ? null : <AuthDialogMount />}
          </ErrorBoundary>
        </ToastProvider>
      </TooltipProvider>
    )
  }

  const phone = bp === null || bp === 'mobile'
  const wide = bp !== 'mobile'

  // One tree for every width, so crossing the breakpoint (or hydrating on a phone) never remounts the page.
  // Phones: top bar, content and the bottom tab tray, no sidebar. Tablets start with the icon rail so the
  // page keeps its width; desktops start expanded. Desktop has no top bar: each page header is the top of
  // the page, and the account menu lives in the sidebar footer.
  return (
    <TooltipProvider delayDuration={120}>
      <ToastProvider>
        <SidebarProvider defaultOpen={bp !== 'tablet'} railRoute={wantsRail}>
          <SkipLink />
          {wide ? <AppSidebar /> : null}
          <SidebarInset>
            <div className={cn('app-main', bp === 'mobile' && 'app-main--mobile')}>
              {phone ? <Topbar /> : null}
              <ServiceBanner />
              <AppContent>{children}</AppContent>
            </div>
          </SidebarInset>
          {phone ? <MobileNav /> : null}
          <CommandPalette />
          <AuthDialogMount />
        </SidebarProvider>
      </ToastProvider>
    </TooltipProvider>
  )
}
