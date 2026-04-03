import {
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { useSidebar } from '#/components/ui/sidebar'

export function ToolFullScreen({
  children,
  accent,
  heroFlow,
}: {
  children: ReactNode
  accent?: string
  heroFlow?: boolean
}) {
  const { isMobile, open, setOpen } = useSidebar()
  const initialDesktopOpenRef = useRef<boolean | null>(null)
  const setOpenRef = useRef(setOpen)

  if (!isMobile && initialDesktopOpenRef.current === null) {
    initialDesktopOpenRef.current = open
  }

  setOpenRef.current = setOpen

  useLayoutEffect(() => {
    document.body.classList.add('tool-fullscreen-open')

    return () => {
      document.body.classList.remove('tool-fullscreen-open')
      if (initialDesktopOpenRef.current !== null) {
        setOpenRef.current(initialDesktopOpenRef.current)
        initialDesktopOpenRef.current = null
      }
    }
  }, [])

  useLayoutEffect(() => {
    if (!isMobile && open) {
      setOpen(false)
    }
  }, [isMobile, open, setOpen])

  return (
    <div
      className={`tool-fullscreen${heroFlow ? ' tool-fullscreen--hero-flow' : ''}`}
      style={{ '--tool-accent': accent } as CSSProperties}
    >
      <div className="tool-fullscreen-scroll">{children}</div>
    </div>
  )
}
