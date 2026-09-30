import { useEffect, useState } from 'react'
import type { ReactNode, RefObject } from 'react'

/** Shared building blocks for the result report layout (see results.css). */

export type BadgeTone = 'success' | 'warning' | 'danger' | 'accent' | 'neutral'

export function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function ResultSection({
  title,
  meta,
  actions,
  children,
  id,
}: {
  title: string
  meta?: ReactNode
  actions?: ReactNode
  children: ReactNode
  id?: string
}) {
  const sectionId = id ?? `sec-${slugify(title)}`
  return (
    <section className="rs-section" id={sectionId} aria-labelledby={`${sectionId}-h`} data-toc-title={title}>
      <div className="rs-section__head">
        <h2 className="rs-section__title" id={`${sectionId}-h`}>
          {title}
        </h2>
        {meta ? <span className="rs-section__meta">{meta}</span> : null}
        {actions ? <div className="rs-section__actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  )
}

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`rbadge rbadge--${tone}`}>{children}</span>
}

const SEVERITY: Record<string, { label: string; tone: BadgeTone }> = {
  high: { label: 'High', tone: 'danger' },
  medium: { label: 'Medium', tone: 'warning' },
  low: { label: 'Low', tone: 'neutral' },
}

export function SeverityBadge({ level }: { level: string }) {
  const entry = SEVERITY[level] ?? SEVERITY.medium
  return <Badge tone={entry.tone}>{entry.label}</Badge>
}

export function scoreTone(score: number): 'success' | 'warning' | 'danger' {
  if (score >= 70) return 'success'
  if (score >= 41) return 'warning'
  return 'danger'
}

/** Thin inline bar; always paired with the number it depicts. */
export function MiniBar({ value, tone }: { value: number; tone?: 'success' | 'warning' | 'danger' | 'accent' }) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <span className="rbar" aria-hidden="true">
      <span className={`rbar__fill rbar__fill--${tone ?? scoreTone(value)}`} style={{ width: `${clamped}%` }} />
    </span>
  )
}

/** Inline list of small tokens (keywords, skills). */
export function TokenList({
  items,
  tone = 'neutral',
  prefix,
}: {
  items: string[]
  tone?: BadgeTone
  prefix?: string
}) {
  if (items.length === 0) return null
  return (
    <ul className="rtokens">
      {items.map((item) => (
        <li key={item}>
          <Badge tone={tone}>
            {prefix}
            {item}
          </Badge>
        </li>
      ))}
    </ul>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rfield">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/** Sticky table of contents built from the rendered `.rs-section` headings. */
export function ResultToc({ containerRef }: { containerRef: RefObject<HTMLElement | null> }) {
  const [entries, setEntries] = useState<Array<{ id: string; title: string }>>([])
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const scan = () => {
      const next = Array.from(el.querySelectorAll<HTMLElement>('section.rs-section[data-toc-title]')).map((s) => ({
        id: s.id,
        title: s.dataset.tocTitle ?? '',
      }))
      setEntries((prev) =>
        prev.length === next.length && prev.every((p, i) => p.id === next[i].id && p.title === next[i].title)
          ? prev
          : next,
      )
    }
    scan()
    const observer = new MutationObserver(scan)
    observer.observe(el, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [containerRef])

  useEffect(() => {
    if (entries.length === 0 || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (records) => {
        const visible = records.filter((r) => r.isIntersecting)
        if (visible.length > 0) setActive(visible[0].target.id)
      },
      { rootMargin: '0px 0px -70% 0px' },
    )
    for (const entry of entries) {
      const node = document.getElementById(entry.id)
      if (node) observer.observe(node)
    }
    return () => observer.disconnect()
  }, [entries])

  if (entries.length < 4) return null

  return (
    <nav className="result-toc" aria-label="On this page">
      <div className="result-toc__title">On this page</div>
      <ul>
        {entries.map((entry) => (
          <li key={entry.id}>
            <a
              href={`#${entry.id}`}
              className={active === entry.id ? 'result-toc__link result-toc__link--active' : 'result-toc__link'}
              onClick={(e) => {
                e.preventDefault()
                document.getElementById(entry.id)?.scrollIntoView({ block: 'start' })
                setActive(entry.id)
              }}
            >
              {entry.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
