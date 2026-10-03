import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { ErrorBoundary } from '#/components/app/ErrorBoundary'
import { AppSidebar } from '#/components/app/AppSidebar'
import { CommandPalette } from '#/components/app/CommandPalette'
import { MobileNav } from '#/components/app/MobileNav'
import { Topbar } from '#/components/app/Topbar'
import { AuthDialog } from '#/components/auth/AuthDialog'
import { Button, ToastProvider, TooltipProvider } from '#/components/kit'
import { SidebarInset, SidebarProvider } from '#/components/ui/sidebar'
import { isPublicRoute } from '#/lib/navigation/publicRoutes'
import { useBreakpoint } from '#/hooks/use-breakpoint'
import { cn } from '#/lib/utils'

const MAIN_ID = 'main-content'

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
  const bp = useBreakpoint()
  const isShellless = isPublicRoute(pathname)
  const isMobile = bp === 'mobile'

  if (isShellless) {
    return (
      <TooltipProvider delayDuration={120}>
        <ToastProvider>
          <ErrorBoundary>
            {children}
            <AuthDialog />
          </ErrorBoundary>
        </ToastProvider>
      </TooltipProvider>
    )
  }

  // Phones: top bar, content and the bottom tab bar. No sidebar.
  if (isMobile) {
    return (
      <TooltipProvider delayDuration={120}>
        <ToastProvider>
          <SkipLink />
          <div className="app-main app-main--mobile">
            <Topbar />
            <AppContent>{children}</AppContent>
          </div>
          <MobileNav />
          <CommandPalette />
          <AuthDialog />
        </ToastProvider>
      </TooltipProvider>
    )
  }

  // Tablets start with the icon rail so the page keeps its width; desktops start expanded.
  return (
    <TooltipProvider delayDuration={120}>
      <ToastProvider>
        <SidebarProvider defaultOpen={bp === 'desktop'}>
          <SkipLink />
          <AppSidebar />
          <SidebarInset>
            {/* Desktop has no top bar: each page header is the top of the page,
                and the account menu lives in the sidebar footer. */}
            <div className="app-main">
              <AppContent>{children}</AppContent>
            </div>
          </SidebarInset>
          <CommandPalette />
          <AuthDialog />
        </SidebarProvider>
      </ToastProvider>
    </TooltipProvider>
  )
}
