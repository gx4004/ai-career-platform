import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
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
import { useResumeCarry } from '#/hooks/use-resume-carry'
import { getResumeCarryText } from '#/lib/tools/resumeCarryStore'
import { SAMPLE_RESUME_TEXT, isSampleResume, rememberResume } from '#/components/tooling/sampleResume'

function countWords(text: string) {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

const ACCEPT = '.pdf,.docx'
/** The backend refuses larger uploads (MAX_CV_SIZE); say so before the bytes leave the browser. */
const MAX_BYTES = 10 * 1024 * 1024
const PREVIEW_CHARS = 280

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

function fileProblem(file: File) {
  if (!/\.(pdf|docx)$/i.test(file.name)) return 'Only PDF and DOCX files can be read. Convert the file, or paste the text instead.'
  if (file.size > MAX_BYTES) return 'That file is larger than 10 MB. Export a smaller PDF, or paste the text instead.'
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
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const refocusPicker = useRef(false)
  const seedChecked = useRef(false)
  const [editing, setEditing] = useState(false)
  // The file the text was read from, with that text: an edit or a paste over it must not keep claiming the file.
  const [fileSource, setFileSource] = useState<{ name: string; text: string } | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [extract, setExtract] = useState<Extract | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [carried, setCarried] = useState(false)
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
      rememberResume(text, file.name)
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

  // A new key remounts the FileInput, which drops focus to <body>; hand it back to the picker so a keyboard user keeps their place.
  useEffect(() => {
    if (!refocusPicker.current) return
    refocusPicker.current = false
    if (document.activeElement && document.activeElement !== document.body) return
    rootRef.current?.querySelector<HTMLInputElement>('input[type="file"]')?.focus()
  }, [pickCount])

  // A resume uploaded or pasted earlier in this tab (on another tool, or on this one before leaving) is reused, not asked for again.
  useEffect(() => {
    if (seedChecked.current) return
    seedChecked.current = true
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
      refocusPicker.current = true
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
  const carriedName = carry.resumeText === value ? carry.filename : ''
  const fromFile = fileLabel(fileSource, value)
  const sourceLabel = isSample
    ? 'Sample resume'
    : (fromFile ??
      (carriedName ||
        (fileSource ? 'Pasted resume' : seeded || carried ? 'Resume carried from previous tool' : 'Resume ready')))
  const wordCount = words > 0 ? (words === 1 ? '1 word' : `${words.toLocaleString()} words`) : ''
  const parseError = mutation.error
    ? mutation.error instanceof Error
      ? mutation.error.message
      : 'Failed to parse resume. Please try again.'
    : null
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
      <Stack gap={2}>
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
            onBlur={() => rememberResume(value)}
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
                rememberResume(value)
                setEditing(false)
              }}
            >
              Done
            </Button>
          ) : null}
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
                <Button type="button" variant="secondary" size="sm" onClick={openEditor}>
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
            accept={ACCEPT}
            hint="Drop a PDF or DOCX here (up to 10 MB)"
            clearable={false}
            onFilesChange={([file]) => handleFile(file)}
          />
        </Field>
        <Cluster gap={4} className="tool-links">
          <Button type="button" variant="link" className="tool-link" onClick={openEditor}>
            Paste text instead
          </Button>
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
            <p className="tool-extract__title">
              Read {readBack.words.toLocaleString()} {readBack.words === 1 ? 'word' : 'words'} from {readBack.name}
            </p>
            <p className="tool-extract__text" dir="auto">
              {readBack.preview}
            </p>
            <Cluster gap={3}>
              <Button type="button" variant="secondary" size="sm" onClick={() => setExtract(null)}>
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
          {warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
          <p>Scanned PDF? It holds a picture of the page, not text. Paste the text here instead, or export a text PDF.</p>
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
