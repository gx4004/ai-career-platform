import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Upload } from 'lucide-react'
import {
  Button,
  Cluster,
  Field,
  FileInput,
  List,
  Notice,
  Panel,
  PanelBody,
  Row,
  RowBody,
  RowSubtitle,
  RowTitle,
  Stack,
  Textarea,
} from '#/components/kit'
import { parseCv } from '#/lib/api/client'
import { useCoarsePointer } from '#/hooks/use-coarse-pointer'
import { useResumeCarry } from '#/hooks/use-resume-carry'
import { readWorkflowContext } from '#/lib/tools/drafts'
import { getResumeCarryText } from '#/lib/tools/resumeCarryStore'
import type { ToolId } from '#/lib/tools/registry'
import { uploadErrorText } from '#/lib/tools/uploadErrors'
import { carryOriginLabel } from '#/lib/tools/workflowContext'
import { SAMPLE_RESUME_TEXT, isSampleResume, rememberResume } from '#/components/tooling/sampleResume'

function countWords(text: string) {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

const ACCEPT = '.pdf,.docx'
/** The backend refuses larger uploads (MAX_CV_SIZE); say so before the bytes leave the browser. */
const MAX_BYTES = 10 * 1024 * 1024
const PREVIEW_CHARS = 280
const FILE_HINT = 'PDF or DOCX, up to 10\u00a0MB'

type Extract = { name: string; words: number; preview: string; empty: boolean }

const flatten = (text: string) => text.replace(/\s+/g, ' ').trim()

/** The uploaded file's name while the text still comes from it: "(edited)" after changes, null once it was replaced wholesale. */
function fileLabel(source: { name: string; text: string } | null, value: string) {
  if (!source) return null
  if (value === source.text) return source.name
  return flatten(value).startsWith(flatten(source.text).slice(0, 60)) ? `${source.name} (edited)` : null
}

/** The first lines of what was read, on one line, so a wrong extraction is obvious at a glance. */
function previewOf(text: string) {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > PREVIEW_CHARS ? `${flat.slice(0, PREVIEW_CHARS).trimEnd()}…` : flat
}

/** The backend's line for a file with no text layer: the scan notice already says it in its title and explanation. */
const isNoTextWarning = (warning: string) => /^no text could be extracted/i.test(warning.trim())

/**
 * The row title for a resume that was carried in (not picked or typed in this visit): where it was supplied. Text pasted
 * on this tool is "Pasted resume", text from another tool is "Resume from Job Match", a CV a Re-generate found in the
 * account keeps its name, and a source the tab does not know is said plainly, never claimed as "a previous tool".
 */
function carriedTitle(origin: string, toolId: ToolId | undefined, source: string | undefined) {
  if (source) return source.charAt(0).toUpperCase() + source.slice(1)
  if (origin && origin === toolId) return 'Pasted resume'
  const from = carryOriginLabel(origin)
  return from ? `Resume from ${from}` : 'Your resume from this session'
}

function fileProblem(file: File) {
  if (!/\.(pdf|docx)$/i.test(file.name)) return 'Only PDF and DOCX files can be read. Convert the file, or paste the text instead.'
  if (file.size > MAX_BYTES) return 'That file is larger than 10\u00a0MB. Export a smaller PDF, or paste the text instead.'
  return null
}

/**
 * Resume control for the tool input pages.
 *
 * - empty: a die-cut dropzone to upload a PDF or DOCX, or a link to paste text or try the sample
 * - has text (uploaded, carried or typed): one row with Change / Upload
 * - just uploaded: a short preview of the text that was read, so a bad extraction is caught before the run
 * - editing: the text area for pasting or reviewing the extracted text
 *
 * A resume the user supplies is also kept for the tab (resume carry store), which is what the
 * Evidence Profile "Import from your CV" reads; the sample resume never is.
 */
export function ResumeSource({
  id,
  label,
  placeholder,
  rows,
  value,
  onChange,
  seeded,
  error,
  onEdit,
  toolId,
}: {
  id: string
  label: string
  placeholder?: string
  rows?: number
  value: string
  onChange: (text: string) => void
  /** Resume text was carried in from an earlier tool. */
  seeded?: boolean
  error?: string
  /** Called when the user opens the editor or replaces the resume. */
  onEdit?: () => void
  /** The tool this form belongs to: text supplied here is remembered as from this tool, and named so when it comes back. */
  toolId?: ToolId
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  // Where keyboard focus goes once the body that held the pressed control is gone (see the effect below).
  const restoreFocus = useRef<'picker' | 'change' | 'paste' | null>(null)
  const changeRef = useRef<HTMLButtonElement | null>(null)
  const pasteRef = useRef<HTMLButtonElement | null>(null)
  const coarsePointer = useCoarsePointer()
  const seedChecked = useRef(false)
  const [editing, setEditing] = useState(false)
  // The file the text was read from, with that text: an edit or a paste over it must not keep claiming the file.
  const [fileSource, setFileSource] = useState<{ name: string; text: string } | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [extract, setExtract] = useState<Extract | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [carried, setCarried] = useState(false)
  // What the tab's workflow context says about its resume (where it was supplied), read after mount like the carry.
  const [contextResume, setContextResume] = useState<{ text: string; origin: string; source?: string } | null>(null)
  // FileInput keeps the name of whatever was chosen; a new key per pick resets it, so a rejected or finished file does not linger in the row.
  const [pickCount, setPickCount] = useState(0)
  // `carried` only names the source; it never keeps the row alive once the text is gone.
  const hasContent = Boolean(value.trim() || seeded)

  const mutation = useMutation({
    mutationFn: parseCv,
    onMutate: () => {
      setWarnings([])
      setExtract(null)
      setLocalError(null)
    },
    onSuccess: (data, file) => {
      setWarnings(data.warnings ?? [])
      setEditing(false)
      const text = data.extracted_text
      const words = countWords(text)
      // A scan with no text layer must not wipe the resume the user already had.
      if (words === 0) {
        setExtract({ name: file.name, words: 0, preview: '', empty: true })
        return
      }
      setFileSource({ name: file.name, text })
      setCarried(false)
      setExtract({ name: file.name, words, preview: previewOf(text), empty: false })
      onChange(text)
      rememberResume(text, file.name, toolId)
    },
  })

  const openEditor = () => {
    onEdit?.()
    setExtract(null)
    setEditing(true)
  }

  useEffect(() => {
    if (editing) textareaRef.current?.focus()
  }, [editing])

  // Most actions here swap the body that held the pressed control (a pick remounts the picker and shows "Reading…", the
  // sample / Done / Looks right leave the resume row, Cancel goes back to the dropzone), which drops focus to <body>. Once
  // the new body is in, focus goes where the keyboard user left off: the picker after a pick (when the read finishes),
  // Change on the resume row, "Paste text instead" after backing out of the paste editor. Only when focus really was
  // lost: a user who moved on meanwhile keeps their place.
  useEffect(() => {
    const target = restoreFocus.current
    if (!target || mutation.isPending) return
    restoreFocus.current = null
    if (document.activeElement && document.activeElement !== document.body) return
    if (target === 'picker') rootRef.current?.querySelector<HTMLInputElement>('input[type="file"]')?.focus()
    else if (target === 'paste') pasteRef.current?.focus()
    else (changeRef.current ?? pasteRef.current)?.focus()
  })

  // A resume uploaded or pasted earlier in this tab (on another tool, or on this one before leaving) is reused, not asked for again.
  useEffect(() => {
    if (seedChecked.current) return
    seedChecked.current = true
    try {
      const context = readWorkflowContext()
      if (context?.resumeText) {
        setContextResume({ text: context.resumeText, origin: context.resumeOrigin ?? '', source: context.resumeSource })
      }
    } catch {
      /* storage unavailable: the row names the resume plainly */
    }
    if (value.trim()) return
    let text = ''
    try {
      text = getResumeCarryText()
    } catch {
      return
    }
    if (!text) return
    setCarried(true)
    onChange(text)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, [])

  const handleFile = useCallback(
    (file: File | null | undefined) => {
      if (!file) return
      restoreFocus.current = 'picker'
      setPickCount((count) => count + 1)
      onEdit?.()
      const problem = fileProblem(file)
      if (problem) {
        setLocalError(problem)
        setExtract(null)
        return
      }
      mutation.mutate(file)
    },
    [mutation, onEdit],
  )

  const loadSample = () => {
    onEdit?.()
    restoreFocus.current = 'change'
    setEditing(false)
    setExtract(null)
    setLocalError(null)
    setWarnings([])
    setCarried(false)
    setFileSource(null)
    onChange(SAMPLE_RESUME_TEXT)
  }

  const words = countWords(value)
  const isSample = isSampleResume(value)
  const carry = useResumeCarry()
  const inCarry = Boolean(value) && carry.resumeText === value
  const inContext = Boolean(value) && contextResume?.text === value
  const carriedName = inCarry ? carry.filename : ''
  const fromFile = fileLabel(fileSource, value)
  const origin = (inCarry && carry.origin) || (inContext ? (contextResume?.origin ?? '') : '')
  const sourceLabel = isSample
    ? 'Sample resume'
    : (fromFile ??
      (carriedName ||
        (fileSource
          ? 'Pasted resume'
          : seeded || carried || inCarry || inContext
            ? carriedTitle(origin, toolId, inContext ? contextResume?.source : undefined)
            : 'Resume ready')))
  const wordCount = words > 0 ? (words === 1 ? '1 word' : `${words.toLocaleString()} words`) : ''
  const parseError = mutation.error ? uploadErrorText(mutation.error, 'paste the text instead') : null
  const shownError = localError ?? parseError ?? error ?? undefined
  const pendingName = mutation.variables?.name

  let body
  if (mutation.isPending) {
    body = (
      <div role="status">
        <Panel tone="stone" flush>
          <List framed={false} aria-busy="true" aria-label="Resume source">
            <Row overflow="truncate">
              <RowBody>
                <RowTitle title={pendingName}>
                  <span className="tool-spinner" aria-hidden="true" />
                  Reading {pendingName ?? 'your resume'}…
                </RowTitle>
              </RowBody>
            </Row>
          </List>
        </Panel>
      </div>
    )
  } else if (editing) {
    body = (
      // 12px: the textarea's focus ring (3px, 2px out) read as touching the "Upload a file instead" outline at 8px.
      <Stack gap={3}>
        <Field
          label={label}
          id={id}
          help={seeded ? 'Resume text carried in from your recent workflow.' : undefined}
          error={shownError}
        >
          <Textarea
            ref={textareaRef}
            rows={rows}
            value={value}
            placeholder={placeholder}
            onChange={(event) => {
              if (!event.target.value.trim()) setCarried(false)
              onChange(event.target.value)
            }}
            onBlur={() => rememberResume(value, undefined, toolId)}
          />
        </Field>
        <Cluster>
          <FileInput
            key={pickCount}
            size="sm"
            label="Upload a file instead"
            accept={ACCEPT}
            clearable={false}
            onFilesChange={([file]) => handleFile(file)}
          />
          {hasContent ? (
            <Button
              type="button"
              variant="link"
              className="tool-link"
              onClick={() => {
                rememberResume(value, undefined, toolId)
                restoreFocus.current = 'change'
                setEditing(false)
              }}
            >
              Done
            </Button>
          ) : (
            // Nothing typed yet: a way back to the dropzone, and the sample stays one click away.
            <>
              <Button type="button" variant="link" className="tool-link" onClick={loadSample}>
                Try with a sample resume
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  restoreFocus.current = 'paste'
                  setEditing(false)
                }}
              >
                Cancel
              </Button>
            </>
          )}
        </Cluster>
      </Stack>
    )
  } else if (hasContent) {
    body = (
      <Field error={shownError}>
        <Panel tone="stone" flush>
          <List framed={false} aria-label="Resume source">
            {/* Wraps rather than truncates: "Made-up example text, not your resume" must stay whole on a phone. */}
            <Row>
              <RowBody>
                <RowTitle>{sourceLabel}</RowTitle>
                {/* The count rides on the subtitle line: as RowMeta it wrapped to an orphan line of its own on a phone. */}
                {isSample || wordCount ? (
                  <RowSubtitle>
                    {isSample ? <span>Made-up example text, not your resume</span> : null}
                    {/* No-break spaces: the dot never starts or ends a line on a phone. */}
                    {isSample && wordCount ? '\u00a0·\u00a0' : null}
                    {wordCount ? <span>{wordCount}</span> : null}
                  </RowSubtitle>
                ) : null}
              </RowBody>
              {/* Not RowActions: in a phone-width list those pin to the first line and collide with the title; a plain cluster wraps under the text instead. */}
              <Cluster className="tool-source-actions">
                <Button ref={changeRef} type="button" variant="secondary" size="sm" onClick={openEditor}>
                  Change
                </Button>
                <FileInput
                  key={pickCount}
                  size="sm"
                  label="Upload"
                  accept={ACCEPT}
                  clearable={false}
                  onFilesChange={([file]) => handleFile(file)}
                />
              </Cluster>
            </Row>
          </List>
        </Panel>
      </Field>
    )
  } else {
    body = (
      <Stack gap={2}>
        <Field label="Resume" error={shownError}>
          <FileInput
            key={pickCount}
            variant="dropzone"
            icon={<Upload />}
            accept={ACCEPT}
            // A mouse can drop a file anywhere on the dropzone: on a fine pointer the hint says so (a finger cannot drag one in).
            hint={
              coarsePointer ? (
                FILE_HINT
              ) : (
                <>
                  Drop your resume here: <span className="tool-drop-hint__formats">{FILE_HINT}</span>
                </>
              )
            }
            clearable={false}
            onFilesChange={([file]) => handleFile(file)}
          />
        </Field>
        {/* The two other ways in read as one line: "Paste text instead · Try with a sample resume". */}
        <Cluster gap={3} className="tool-links">
          <Button ref={pasteRef} type="button" variant="link" className="tool-link" onClick={openEditor}>
            Paste text instead
          </Button>
          <span className="tool-links__dot" aria-hidden="true">
            ·
          </span>
          <Button type="button" variant="link" className="tool-link" onClick={loadSample}>
            Try with a sample resume
          </Button>
        </Cluster>
      </Stack>
    )
  }

  const emptyScan = extract?.empty ? extract : null
  const readBack = extract && !extract.empty && !editing && !mutation.isPending ? extract : null

  return (
    <Stack gap={2} ref={rootRef}>
      {body}
      {readBack ? (
        <Panel tone="stone" className="tool-extract" aria-label="What was read from your file">
          <PanelBody className="tool-extract__body">
            {/* The file name and word count are in the resume row right above: this panel is titled by its job. */}
            <p className="tool-extract__title">Check what was read</p>
            <p className="tool-extract__text" dir="auto">
              {readBack.preview}
            </p>
            <Cluster gap={3}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  restoreFocus.current = 'change'
                  setExtract(null)
                }}
              >
                Looks right
              </Button>
              <Button type="button" variant="link" className="tool-link" onClick={openEditor}>
                Fix the text
              </Button>
            </Cluster>
          </PanelBody>
        </Panel>
      ) : null}
      {emptyScan ? (
        <Notice
          tone="warning"
          title={`No readable text in ${emptyScan.name}`}
          action={
            <Button type="button" variant="secondary" size="sm" onClick={openEditor}>
              Paste your resume text
            </Button>
          }
        >
          {warnings
            .filter((warning) => !isNoTextWarning(warning))
            .map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          <p>Scanned PDF? It holds a picture of the page, not text. Paste the text here instead, or export a text PDF.</p>
          {/* The resume already in the row was kept: say that the run still uses it, not nothing. */}
          {value.trim() ? <p>Your earlier resume ({sourceLabel}) is still the one this run uses.</p> : null}
        </Notice>
      ) : warnings.length > 0 ? (
        <Notice tone="warning">
          {warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </Notice>
      ) : null}
    </Stack>
  )
}
