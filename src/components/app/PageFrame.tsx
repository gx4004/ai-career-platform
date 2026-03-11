import type { ReactNode } from 'react'
import { cn } from '#/lib/utils'

export function PageFrame({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <main id="main-content" className={cn('page-frame page-shell', className)}>
      {children}
    </main>
  )
}
