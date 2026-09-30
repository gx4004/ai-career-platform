import type { CSSProperties, ReactNode } from 'react'

/** Frame for a tool's input page: an ordinary page inside the app shell. */
export function ToolFullScreen({
  children,
  accent,
  heroFlow,
}: {
  children: ReactNode
  accent?: string
  heroFlow?: boolean
}) {
  return (
    <div
      className={`tool-fullscreen${heroFlow ? ' tool-fullscreen--hero-flow' : ''}`}
      style={{ '--tool-accent': accent } as CSSProperties}
    >
      <div className="tool-fullscreen-scroll">{children}</div>
    </div>
  )
}
