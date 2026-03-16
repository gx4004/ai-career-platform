import type { ReactNode } from 'react'
import { SceneVisual } from '#/components/illustrations/SceneVisual'
import type { IllustrationScene } from '#/components/illustrations/SceneVisual'
import { cn } from '#/lib/utils'

export function SceneEvidence({
  scene,
  className,
  overlayClassName,
  children,
}: {
  scene: IllustrationScene
  className?: string
  overlayClassName?: string
  children?: ReactNode
}) {
  return (
    <div className={cn('scene-evidence', className)}>
      <SceneVisual scene={scene} className="scene-evidence-media" />
      <div className={cn('scene-evidence-overlay', overlayClassName)}>{children}</div>
    </div>
  )
}
