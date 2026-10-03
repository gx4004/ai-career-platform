import * as React from 'react'
import { Slot } from 'radix-ui'

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Button, Tooltip } from '#/components/kit'
import { cn } from '#/lib/utils'

/*
 * The app sidebar's building blocks: a provider that owns open/collapsed state
 * (persisted in a cookie, toggled with Ctrl/Cmd+B) and plain elements styled in
 * styles/shell.css. Desktop and tablet only: phones get MobileNav instead.
 */

const SIDEBAR_COOKIE_NAME = 'sidebar_state'
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7
const SIDEBAR_KEYBOARD_SHORTCUT = 'b'

type SidebarContextProps = {
  state: 'expanded' | 'collapsed'
  open: boolean
  setOpen: (open: boolean) => void
  toggleSidebar: () => void
}

const SidebarContext = React.createContext<SidebarContextProps | null>(null)

function getSidebarOpenFromCookie() {
  if (typeof document === 'undefined') return null
  const cookieValue = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${SIDEBAR_COOKIE_NAME}=`))
    ?.split('=')[1]
  if (cookieValue === 'true') return true
  if (cookieValue === 'false') return false
  return null
}

function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) throw new Error('useSidebar must be used within a SidebarProvider.')
  return context
}

function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen)
  const open = openProp ?? internalOpen
  const setControlled = setOpenProp ?? setInternalOpen

  React.useEffect(() => {
    const stored = getSidebarOpenFromCookie()
    if (stored !== null) setControlled(stored)
  }, [setControlled])

  const setOpen = React.useCallback(
    (value: boolean) => {
      setControlled(value)
      document.cookie = `${SIDEBAR_COOKIE_NAME}=${value}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`
    },
    [setControlled],
  )

  const toggleSidebar = React.useCallback(() => setOpen(!open), [open, setOpen])

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === SIDEBAR_KEYBOARD_SHORTCUT && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleSidebar])

  const state = open ? 'expanded' : 'collapsed'
  const value = React.useMemo<SidebarContextProps>(
    () => ({ state, open, setOpen, toggleSidebar }),
    [state, open, setOpen, toggleSidebar],
  )

  return (
    <SidebarContext.Provider value={value}>
      <div data-slot="sidebar-wrapper" className={cn('app-shell', className)} {...props}>
        {children}
      </div>
    </SidebarContext.Provider>
  )
}

/** The sidebar column. `collapsible="icon"` shrinks it to an icon rail instead of hiding it. */
function Sidebar({
  collapsible = 'icon',
  className,
  children,
  ...props
}: React.ComponentProps<'aside'> & { collapsible?: 'icon' | 'none' }) {
  const { state } = useSidebar()
  return (
    <aside
      data-slot="sidebar"
      data-sidebar="sidebar"
      data-state={state}
      data-collapsible={state === 'collapsed' ? collapsible : ''}
      className={cn('app-sidebar', className)}
      {...props}
    >
      {children}
    </aside>
  )
}

function SidebarTrigger({ className, ...props }: Omit<React.ComponentProps<typeof Button>, 'iconOnly' | 'children'>) {
  const { state, toggleSidebar } = useSidebar()
  const collapsed = state === 'collapsed'
  const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar'
  return (
    <Tooltip content={label} shortcut="⌘B" side={collapsed ? 'right' : 'bottom'}>
      <Button
        data-slot="sidebar-trigger"
        iconOnly
        variant="ghost"
        size="sm"
        aria-label={label}
        className={className}
        {...props}
        onClick={(event) => {
          props.onClick?.(event)
          toggleSidebar()
        }}
      >
        {collapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
      </Button>
    </Tooltip>
  )
}

/** The page side of the shell. A plain div: every page renders its own <main> (kit Page), the shell must not add a second. */
function SidebarInset({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="sidebar-inset" className={cn('app-inset', className)} {...props} />
}

function SidebarHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="sidebar-header" data-sidebar="header" className={cn('app-sidebar__header', className)} {...props} />
}

function SidebarFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="sidebar-footer" data-sidebar="footer" className={cn('app-sidebar__footer', className)} {...props} />
}

function SidebarContent({ className, ...props }: React.ComponentProps<'nav'>) {
  return (
    <nav
      data-slot="sidebar-content"
      data-sidebar="content"
      aria-label="Main navigation"
      className={cn('app-sidebar__content', className)}
      {...props}
    />
  )
}

function SidebarGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="sidebar-group" data-sidebar="group" className={cn('app-sidebar__group', className)} {...props} />
}

function SidebarGroupLabel({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-group-label"
      data-sidebar="group-label"
      className={cn('app-sidebar__group-label', className)}
      {...props}
    />
  )
}

function SidebarGroupContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="sidebar-group-content" data-sidebar="group-content" className={className} {...props} />
}

function SidebarMenu({ className, ...props }: React.ComponentProps<'ul'>) {
  return <ul data-slot="sidebar-menu" data-sidebar="menu" className={cn('app-sidebar__menu', className)} {...props} />
}

function SidebarMenuItem(props: React.ComponentProps<'li'>) {
  return <li data-slot="sidebar-menu-item" data-sidebar="menu-item" {...props} />
}

/**
 * The bubble that names an icon when the sidebar is collapsed to its rail. Controlled, so it can only
 * open while the labels are hidden and never while the sidebar is expanded.
 */
function SidebarTooltip({
  tooltip,
  shortcut,
  children,
}: {
  tooltip: string
  shortcut?: string
  children: React.ReactElement
}) {
  const { state } = useSidebar()
  const [open, setOpen] = React.useState(false)
  return (
    <Tooltip content={tooltip} shortcut={shortcut} side="right" open={state === 'collapsed' && open} onOpenChange={setOpen}>
      {children}
    </Tooltip>
  )
}

/**
 * One row of the sidebar: icon, label and an optional trailing hint. `asChild` turns a router Link into the row.
 * `tooltip` names the row when the sidebar is collapsed to its icon rail (the label is hidden then).
 */
function SidebarMenuButton({
  asChild = false,
  isActive = false,
  tooltip,
  shortcut,
  className,
  ...props
}: React.ComponentProps<'button'> & {
  asChild?: boolean
  isActive?: boolean
  tooltip?: string
  shortcut?: string
}) {
  const Comp = asChild ? Slot.Root : 'button'
  const button = (
    <Comp
      data-slot="sidebar-menu-button"
      data-sidebar="menu-button"
      data-active={isActive}
      aria-current={isActive && asChild ? 'page' : undefined}
      className={cn('app-sidebar__button', className)}
      {...props}
    />
  )
  return tooltip ? (
    <SidebarTooltip tooltip={tooltip} shortcut={shortcut}>
      {button}
    </SidebarTooltip>
  ) : (
    button
  )
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTooltip,
  SidebarTrigger,
  useSidebar,
}
