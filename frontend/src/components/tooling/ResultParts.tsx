import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Check } from 'lucide-react'
import {
  Badge,
  Button,
  JumpNav,
  List,
  Row,
  RowBody,
  RowLeading,
  RowMeta,
  RowSubtitle,
  RowTitle,
  Section,
  ToolTile,
} from '#/components/kit'
import type { BadgeTone, SectionProps, Tone } from '#/components/kit'
import { draftClearCount } from '#/lib/tools/drafts'
import { editedLetterTexts, letterFlushers } from '#/lib/tools/letterState'
import { request } from '#/lib/api/client'
import { isDemoHistoryId } from '#/lib/tools/demoRuns'
import { tools } from '#/lib/tools/registry'
import type { ToolDefinition, ToolId } from '#/lib/tools/registry'

/** Shared building blocks for the result report layout (see results.css). */

export function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** The id a result Section gets from its title, so the jump nav can link to it. */
export function sectionId(title: string) {
  return `sec-${slugify(title)}`
}

/** A kit Section that the jump nav can find: its id comes from its title. */
export function ReportSection({ title, ...props }: Omit<SectionProps, 'id' | 'title'> & { title: string }) {
  return <Section id={sectionId(title)} data-toc-title={title} title={title} {...props} />
}

/**
 * What the report page around a result view needs to know about it. Practice mode takes over the
 * report; while it runs the page's Re-generate button steps back so the practice card holds the
 * view's one primary button. `reveal` is true on the one mount that follows a run that just
 * finished: the seal stamps in and the Fix-first stickers slap on.
 */
export const ResultChromeContext = createContext<{
  setPracticing: (practicing: boolean) => void
  reveal: boolean
  /** The signed-in person's full name: a letter without a sign-off is signed with it (never for a guest). */
  signerName?: string | null
} | null>(null)

/** Tell the report page that the view is (or is no longer) in a focused task. */
export function useReportPracticing(practicing: boolean) {
  const chrome = useContext(ResultChromeContext)
  const setPracticing = chrome?.setPracticing
  useEffect(() => {
    setPracticing?.(practicing)
    return () => setPracticing?.(false)
  }, [practicing, setPracticing])
}

/** The name a letter is signed with: the signed-in person's full name, or null (a guest, or no name on the account). */
export function useResultSignerName() {
  const name = useContext(ResultChromeContext)?.signerName?.trim()
  return name ? name : null
}

/** True while the signature reveal plays (never outside the report page, never on a revisit). */
export function useResultReveal() {
  return useContext(ResultChromeContext)?.reveal ?? false
}

const SEVERITY: Record<string, { label: string; tone: BadgeTone }> = {
  high: { label: 'High', tone: 'danger' },
  medium: { label: 'Medium', tone: 'warning' },
  low: { label: 'Low', tone: 'lilac' },
}

/**
 * High, Medium or Low. Rose, lemon and lilac on the page; white on a lemon sticker, where a lemon
 * badge would vanish.
 */
export function SeverityBadge({ level, onSticker = false }: { level: string; onSticker?: boolean }) {
  const key = level in SEVERITY ? level : 'medium'
  const entry = SEVERITY[key]
  return (
    <Badge tone={onSticker ? 'white' : entry.tone} data-severity={key}>
      {entry.label}
    </Badge>
  )
}

const GOOD_WORDS = /\b(strong|good|solid|excellent|great|ready|high|foundation|identified|clear)\b/i
const FAIR_WORDS = /\b(borderline|fair|moderate|developing|partial|mixed|uneven|promising|needs|gap-first|advisory)\b/i
// "Needs stronger evidence" is the resume's lowest band: tested before FAIR ("needs") so it is rose, not lemon.
const WEAK_WORDS = /\b(weak|poor|stretch|low|unlikely|thin|risky|stronger evidence)\b/i

/**
 * The colour of a verdict sticker, by meaning: mint good, lemon borderline, rose weak. The words win
 * (a Job Match "borderline" is lemon whatever its score); without a recognisable word the score decides.
 */
export function verdictTone(verdict: string, score?: number | null): Tone {
  const text = verdict.trim()
  if (WEAK_WORDS.test(text)) return 'rose'
  if (FAIR_WORDS.test(text)) return 'lemon'
  if (GOOD_WORDS.test(text)) return 'mint'
  if (typeof score === 'number' && Number.isFinite(score)) {
    if (score >= 75) return 'mint'
    if (score >= 50) return 'lemon'
    return 'rose'
  }
  return 'white'
}

/** The mint tick of a strengths row: the number disc's shape with a check in it. */
export function CheckDisc() {
  return (
    <span className="kit-number-disc" data-tone="mint" aria-hidden="true">
      <Check strokeWidth={3} size={16} />
    </span>
  )
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
  /** Something in front of the text (a tick), instead of the list's number. */
  leading?: ReactNode
  /** lg: a 17px title, for a row that is a statement on its own (a strength). */
  titleSize?: 'md' | 'lg'
  /** semibold for a statement (a strength); regular for a full sentence or a quote (a note, a tip). Default bold. */
  titleWeight?: 'bold' | 'semibold' | 'regular'
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
  framed,
  flush,
  boxed,
}: {
  items: ResultItem[]
  numbered?: boolean
  label: string
  density?: 'compact' | 'comfortable'
  framed?: boolean
  /** Rows start at the container's content edge; for an unframed list under a heading inside a Panel. */
  flush?: boolean
  /** 'end': the list sits right under its own heading, which rests on the first row; a rule closes the last row. */
  boxed?: boolean | 'end'
}) {
  return (
    <List numbered={numbered} aria-label={label} framed={framed} flush={flush} boxed={boxed}>
      {items.map((item) => (
        <Row key={item.key} density={density} className={item.body ? 'result-row--stacked' : undefined}>
          {item.leading ? <RowLeading>{item.leading}</RowLeading> : null}
          <RowBody>
            <RowTitle size={item.titleSize} weight={item.titleWeight}>
              {item.title}
            </RowTitle>
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

/** Jump nav built from the rendered result Sections (those carrying data-toc-title). */
export function ResultJumpNav({ containerRef }: { containerRef: RefObject<HTMLElement | null> }) {
  const [entries, setEntries] = useState<Array<{ id: string; label: string }>>([])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const scan = () => {
      const next = Array.from(el.querySelectorAll<HTMLElement>('section[data-toc-title]')).map((s) => ({
        id: s.id,
        label: s.dataset.tocTitle ?? '',
      }))
      setEntries((prev) =>
        prev.length === next.length && prev.every((p, i) => p.id === next[i].id && p.label === next[i].label)
          ? prev
          : next,
      )
    }
    scan()
    const observer = new MutationObserver(scan)
    observer.observe(el, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [containerRef])

  if (entries.length < 3) return null
  return <JumpNav aria-label="On this page" items={entries} />
}

/**
 * Where to go from here: the registry's two next tools for this one, each opening with the resume
 * and job the workflow already carries. Not a list of suggestions made up per result.
 */
export function WhatNext({
  tool,
  lead,
  onOpen,
}: {
  tool: ToolDefinition
  lead?: ReactNode
  /**
   * Runs before the next tool opens (a plain click only): fills in what a result opened cold cannot carry. The
   * next tool then opens with ?from=<this tool>, so it can say what is still missing and why.
   */
  onOpen?: (to: ToolId) => Promise<void>
}) {
  const navigate = useNavigate()
  const [opening, setOpening] = useState<ToolId | null>(null)
  const actions = tool.nextActions.filter((action) => action.to !== tool.id)
  if (actions.length === 0 && !lead) return null
  return (
    <Section id="what-next" title="What next">
      <List aria-label="What next">
        {lead}
        {actions.map((action) => {
          const target = tools[action.to]
          return (
            <Row key={action.to}>
              <RowLeading>
                {/* Flat: the tilted, shadowed lg tile is the page-title mark only (STICKER 1.15; mockup .next .tile-lg). */}
                <ToolTile tone={target.tone} icon={target.icon} size="lg" flat />
              </RowLeading>
              <RowBody>
                <RowTitle size="lg">{action.label}</RowTitle>
                <RowSubtitle size="lg">{target.summary}</RowSubtitle>
              </RowBody>
              <RowMeta>
                <Button asChild variant="secondary" size="sm">
                  <Link
                    to={target.route}
                    aria-busy={opening === action.to || undefined}
                    onClick={
                      onOpen
                        ? (event) => {
                            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
                            event.preventDefault()
                            if (opening) return
                            setOpening(action.to)
                            void onOpen(action.to)
                              .catch(() => {
                                /* best effort: the form asks for anything missing */
                              })
                              .finally(() => void navigate({ to: `${target.route}?from=${tool.id}` }))
                          }
                        : undefined
                    }
                  >
                    Open {target.label}
                  </Link>
                </Button>
              </RowMeta>
            </Row>
          )
        })}
      </List>
    </Section>
  )
}

/* ── Cover-letter edits ──
 * The letter is editable on the result page. Edits are saved as you type: to the run when the
 * backend accepts them, always to this tab's session storage (so a reload keeps them; a closed tab does not, as for every guest result).
 * Copy and every export (text, Markdown, PDF) read the last edited version from here.
 */

export type LetterDraft = { opening: string; body: string[]; closing: string }
export type LetterSaveState = 'idle' | 'saving' | 'saved' | 'saved-local' | 'error'

const LETTER_KEY = 'cw:letter-edit:'

export function readLetterDraft(runId: string): LetterDraft | null {
  try {
    const raw = window.sessionStorage.getItem(LETTER_KEY + runId)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<LetterDraft>
    if (typeof parsed.opening !== 'string' || typeof parsed.closing !== 'string' || !Array.isArray(parsed.body)) return null
    return { opening: parsed.opening, closing: parsed.closing, body: parsed.body.map((p) => String(p)) }
  } catch {
    return null
  }
}

function writeLetterDraft(runId: string, draft: LetterDraft) {
  try {
    window.sessionStorage.setItem(LETTER_KEY + runId, JSON.stringify(draft))
  } catch {
    // storage blocked: the edit still reaches the server for a saved run
  }
}

function clearLetterDraft(runId: string) {
  try {
    window.sessionStorage.removeItem(LETTER_KEY + runId)
  } catch {
    // ignore
  }
}

/** The edited text of a run's letter while its page is open (undefined when it was not edited). */
export function editedLetterText(runId: string | undefined) {
  return runId ? editedLetterTexts.get(runId) : undefined
}

export function setEditedLetterText(runId: string, text: string | null) {
  if (text === null) editedLetterTexts.delete(runId)
  else editedLetterTexts.set(runId, text)
}

/** Save any pending edit of this run's letter now (the PDF export waits for it). */
export async function flushLetterEdits(runId: string) {
  await letterFlushers.get(runId)?.()
}

async function saveLetterToServer(runId: string, draft: LetterDraft) {
  await request(`/history/${runId}/letter`, {
    method: 'PATCH',
    body: { opening: draft.opening, body_points: draft.body, closing: draft.closing },
  })
}

const AUTOSAVE_MS = 900

/**
 * Autosave for the letter's paragraphs. `edited` is false until the person changes something, so
 * opening a result never writes. Returns the state to show ("Saved", "Saved on this device"...).
 */
export function useLetterAutosave(runId: string | undefined, draft: LetterDraft, edited: boolean, persistToServer: boolean) {
  const [state, setState] = useState<LetterSaveState>('idle')
  const privacyGeneration = useRef(draftClearCount())
  const latest = useRef(draft)
  latest.current = draft
  const dirty = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The save on its way to the server, if any: a flush (the PDF export) waits for it instead of returning
  // while the server still holds the previous letter.
  const inFlight = useRef<Promise<void> | null>(null)

  const save = useCallback(async () => {
    while (inFlight.current) await inFlight.current
    if (privacyGeneration.current !== draftClearCount() || !runId || !dirty.current) return
    dirty.current = false
    const snapshot = latest.current
    writeLetterDraft(runId, snapshot)
    if (!persistToServer || isDemoHistoryId(runId)) {
      setState('saved-local')
      return
    }
    setState('saving')
    const attempt = (async () => {
      try {
        await saveLetterToServer(runId, snapshot)
        if (privacyGeneration.current !== draftClearCount()) return
        clearLetterDraft(runId)
        setState('saved')
      } catch (error) {
        if (privacyGeneration.current !== draftClearCount()) return
        const status = (error as { status?: number } | null)?.status
        // No save endpoint on this server: the edit stays on this device and says so.
        const unsupported = status === 404 || status === 405 || status === 501
        // A save that failed is still owed: the next flush (or edit) tries it again.
        if (!unsupported) dirty.current = true
        setState(unsupported ? 'saved-local' : 'error')
      }
    })()
    inFlight.current = attempt
    try {
      await attempt
    } finally {
      if (inFlight.current === attempt) inFlight.current = null
    }
  }, [persistToServer, runId])

  useEffect(() => {
    if (!runId || !edited) return
    dirty.current = true
    setState('saving')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(), AUTOSAVE_MS)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [draft.opening, draft.closing, draft.body, edited, runId, save])

  useEffect(() => {
    if (!runId) return
    letterFlushers.set(runId, async () => {
      if (timer.current) clearTimeout(timer.current)
      await save()
    })
    return () => {
      letterFlushers.delete(runId)
      // Leaving the page with an unsaved edit: save it on the way out.
      if (timer.current) clearTimeout(timer.current)
      void save()
    }
  }, [runId, save])

  return state
}
