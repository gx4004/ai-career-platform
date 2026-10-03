import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { Badge, List, Row, RowBody, RowMeta, RowSubtitle, RowTitle, Section } from '#/components/kit'
import type { BadgeTone, SectionProps } from '#/components/kit'

/** Shared building blocks for the result report layout (see results.css). */

export function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** The id a result Section gets from its title, so the table of contents can link to it. */
export function sectionId(title: string) {
  return `sec-${slugify(title)}`
}

/** A kit Section that the table of contents can find: its id comes from its title. */
export function ReportSection({ title, ...props }: Omit<SectionProps, 'id' | 'title'> & { title: string }) {
  return <Section id={sectionId(title)} data-toc-title={title} title={title} {...props} />
}

/**
 * What the report page around a result view needs to know about it. Practice mode takes over the
 * report; while it runs the page's Re-generate button steps back so the practice card holds the
 * view's one primary button.
 */
export const ResultChromeContext = createContext<{ setPracticing: (practicing: boolean) => void } | null>(null)

/** Tell the report page that the view is (or is no longer) in a focused task. */
export function useReportPracticing(practicing: boolean) {
  const chrome = useContext(ResultChromeContext)
  const setPracticing = chrome?.setPracticing
  useEffect(() => {
    setPracticing?.(practicing)
    return () => setPracticing?.(false)
  }, [practicing, setPracticing])
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

export type ResultItem = {
  key: string
  /** One line: the thing the row is about. */
  title: ReactNode
  /** One quiet line under the title. */
  detail?: ReactNode
  /** Severity or status at the end of the row. */
  meta?: ReactNode
  /** More content under the detail (a KeyValue of "Why it matters / Fix"). */
  body?: ReactNode
}

/**
 * The one list of a report: optional number, title, status and a line of detail. Every list of every
 * result page is this, so a fix, a step, a project and a question all look the same.
 */
export function ResultList({
  items,
  numbered = false,
  label,
  density,
}: {
  items: ResultItem[]
  numbered?: boolean
  label: string
  density?: 'compact' | 'comfortable'
}) {
  return (
    <List numbered={numbered} aria-label={label}>
      {items.map((item) => (
        <Row key={item.key} density={density} className={item.body ? 'result-row--stacked' : undefined}>
          <RowBody>
            <RowTitle>{item.title}</RowTitle>
            {item.detail ? <RowSubtitle>{item.detail}</RowSubtitle> : null}
            {item.body}
          </RowBody>
          {item.meta ? <RowMeta>{item.meta}</RowMeta> : null}
        </Row>
      ))}
    </List>
  )
}

/** A paragraph of report text (a rationale, a summary). `strong` is the opening line of a block. */
export function Prose({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
  return (
    <p className="result-prose" data-strong={strong || undefined}>
      {children}
    </p>
  )
}

/** Short lines under one label (key points, hiring signals), one per line, no bullets. */
export function Lines({ items }: { items: string[] }) {
  return (
    <ul className="result-lines" role="list">
      {items.map((item, i) => (
        <li key={`${i}-${item}`}>{item}</li>
      ))}
    </ul>
  )
}

/** Table of contents built from the rendered result Sections (those carrying data-toc-title). */
export function ResultToc({ containerRef }: { containerRef: RefObject<HTMLElement | null> }) {
  const [entries, setEntries] = useState<Array<{ id: string; title: string }>>([])
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const scan = () => {
      const next = Array.from(el.querySelectorAll<HTMLElement>('section[data-toc-title]')).map((s) => ({
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
      <p className="result-toc__title">On this page</p>
      <List aria-label="Sections">
        {entries.map((entry) => (
          <Row key={entry.id} density="compact" selected={active === entry.id} interactive>
            <RowBody>
              <RowTitle asChild>
                <a
                  href={`#${entry.id}`}
                  aria-current={active === entry.id ? 'location' : undefined}
                  onClick={(e) => {
                    e.preventDefault()
                    document.getElementById(entry.id)?.scrollIntoView({ block: 'start' })
                    setActive(entry.id)
                  }}
                >
                  {entry.title}
                </a>
              </RowTitle>
            </RowBody>
          </Row>
        ))}
      </List>
    </nav>
  )
}
