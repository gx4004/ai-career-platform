import type { ReactNode } from 'react'
import { Panel, PanelBody, PanelHeader } from '#/components/kit'
import type { Tone } from '#/components/kit'

/**
 * One block of the application page: a white Panel with the title in its header (a level-2 heading), a
 * quiet sentence under it, then the content. Replaces the page's loose Sections so the detail reads as
 * a column of panels beside the Details and Tasks rail.
 */
export function ApplicationPanel({
  title,
  description,
  actions,
  tone,
  className,
  children,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  /** The panel's soft tint: lemon when it waits on the owner, mint when it is done. White by default. */
  tone?: Tone
  className?: string
  children: ReactNode
}) {
  return (
    <Panel as="section" tone={tone} className={className}>
      <PanelHeader title={title} actions={actions} />
      <PanelBody className="camp-panel__body">
        {description ? <p className="camp-note">{description}</p> : null}
        {children}
      </PanelBody>
    </Panel>
  )
}
