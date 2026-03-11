import { useEffect, type CSSProperties, type ReactNode } from 'react'
import { useSidebar } from '#/components/ui/sidebar'

export function ToolFullScreen({
  children,
  accent,
}: {
  children: ReactNode
  accent?: string
}) {
  const { setOpen } = useSidebar()

  useEffect(() => {
    setOpen(false)
  }, [setOpen])

  return (
    <div
      className="tool-fullscreen"
      style={{ '--tool-accent': accent } as CSSProperties}
    >
      <div className="tool-fullscreen-scroll">{children}</div>
    </div>
  )
}
