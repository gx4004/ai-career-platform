import type { ImgHTMLAttributes } from 'react'
import landingControlRoom from '#/assets/scenes/landing-control-room.png'
import dashboardWorkspace from '#/assets/scenes/dashboard-workspace.png'
import loginWorkflow from '#/assets/scenes/login-workflow.png'
import emptyPlanningDesk from '#/assets/scenes/empty-planning-desk.png'
import { cn } from '#/lib/utils'

export type IllustrationScene =
  | 'landingHero'
  | 'dashboardHero'
  | 'loginWorkflow'
  | 'emptyPlanning'

type SceneDefinition = {
  src: string
  alt: string
  aspectRatio: string
  accent: string
  width: number
  height: number
  loading: 'eager' | 'lazy'
  fetchPriority: NonNullable<ImgHTMLAttributes<HTMLImageElement>['fetchPriority']>
  decorative: boolean
}

export const sceneRegistry: Record<IllustrationScene, SceneDefinition> = {
  landingHero: {
    src: landingControlRoom,
    alt: 'Career control room scene showing connected resume analysis, match scoring, and workflow modules.',
    aspectRatio: '16 / 11',
    accent: 'var(--accent)',
    width: 1600,
    height: 1100,
    loading: 'eager',
    fetchPriority: 'high',
    decorative: true,
  },
  dashboardHero: {
    src: dashboardWorkspace,
    alt: 'Active workspace scene with connected modules, charting, and saved workflow progress.',
    aspectRatio: '16 / 11',
    accent: 'var(--career-accent)',
    width: 1600,
    height: 1100,
    loading: 'eager',
    fetchPriority: 'high',
    decorative: true,
  },
  loginWorkflow: {
    src: loginWorkflow,
    alt: 'Connected six-tool workflow scene orbiting around a central application hub.',
    aspectRatio: '16 / 11',
    accent: 'var(--accent-vivid)',
    width: 1600,
    height: 1100,
    loading: 'eager',
    fetchPriority: 'high',
    decorative: true,
  },
  emptyPlanning: {
    src: emptyPlanningDesk,
    alt: 'Planning desk scene with organized notes, a completed checklist, and workflow accents.',
    aspectRatio: '16 / 11',
    accent: 'var(--portfolio-accent)',
    width: 1600,
    height: 1100,
    loading: 'lazy',
    fetchPriority: 'auto',
    decorative: true,
  },
}

export function SceneVisual({
  scene,
  className,
  imageClassName,
  loading,
  fetchPriority,
  decorative,
}: {
  scene: IllustrationScene
  className?: string
  imageClassName?: string
  loading?: 'eager' | 'lazy'
  fetchPriority?: NonNullable<ImgHTMLAttributes<HTMLImageElement>['fetchPriority']>
  decorative?: boolean
}) {
  const definition = sceneRegistry[scene]
  const resolvedDecorative = decorative ?? definition.decorative

  return (
    <div
      className={cn('scene-visual', className)}
      style={{
        ['--scene-ratio' as string]: definition.aspectRatio,
        ['--scene-accent' as string]: definition.accent,
      }}
    >
      <div className="scene-visual-frame">
        <img
          src={definition.src}
          alt={resolvedDecorative ? '' : definition.alt}
          aria-hidden={resolvedDecorative || undefined}
          width={definition.width}
          height={definition.height}
          loading={loading ?? definition.loading}
          fetchPriority={fetchPriority ?? definition.fetchPriority}
          className={cn('scene-visual-image', imageClassName)}
        />
      </div>
    </div>
  )
}
