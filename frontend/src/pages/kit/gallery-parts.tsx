import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { cn } from '#/lib/utils'

export function GallerySection({
  id,
  title,
  note,
  children,
}: {
  id: string
  title: string
  note?: ReactNode
  children: ReactNode
}) {
  return (
    <section id={id} className="kit-gallery__section" aria-labelledby={`${id}-title`}>
      <header className="kit-gallery__section-head">
        <h2 id={`${id}-title`} className="kit-gallery__section-title">
          {title}
        </h2>
        {note ? <p className="kit-gallery__section-note">{note}</p> : null}
      </header>
      {children}
    </section>
  )
}

export function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="kit-gallery__group">
      <h3 className="kit-gallery__group-title">{title}</h3>
      {children}
    </div>
  )
}

export function Row({ children, top = false, className }: { children: ReactNode; top?: boolean; className?: string }) {
  return <div className={cn('kit-gallery__row', top && 'kit-gallery__row--top', className)}>{children}</div>
}

export function Specimen({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('kit-gallery__specimen', className)}>
      <span className="kit-gallery__label">{label}</span>
      {children}
    </div>
  )
}

export function Grid({ children, wide = false }: { children: ReactNode; /** Wider columns, for panels. */ wide?: boolean }) {
  return <div className={cn('kit-gallery__grid', wide && 'kit-gallery__grid--wide')}>{children}</div>
}

/** A scrim-coloured backdrop holding a static (non-portalled) copy of an overlay, so it can be judged at rest. Inert: it is a picture, not a second control to tab through. */
export function Stage({
  children,
  className,
  label,
}: {
  children: ReactNode
  className?: string
  label: string
}) {
  return (
    <div className={cn('kit-gallery__stage', className)} role="group" aria-label={label} inert>
      {children}
    </div>
  )
}

/** A link that goes nowhere: specimens need real anchors, but a click must not scroll the gallery. */
export const DemoLink = forwardRef<HTMLAnchorElement, Omit<ComponentPropsWithoutRef<'a'>, 'href'>>(function DemoLink(
  { onClick, ...rest },
  ref,
) {
  return (
    <a
      ref={ref}
      href="#"
      onClick={(event) => {
        event.preventDefault()
        onClick?.(event)
      }}
      {...rest}
    />
  )
})
