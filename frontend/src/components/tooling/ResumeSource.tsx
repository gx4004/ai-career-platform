import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  Button,
  Cluster,
  Field,
  FileInput,
  List,
  Notice,
  Row,
  RowActions,
  RowBody,
  RowMeta,
  RowTitle,
  Stack,
  Textarea,
} from '#/components/kit'
import { parseCv } from '#/lib/api/client'

function countWords(text: string) {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

const ACCEPT = '.pdf,.docx'

/**
 * Resume control for the tool input pages.
 *
 * - empty: a dropzone to upload a PDF or DOCX, or a button to paste text instead
 * - has text (uploaded, carried or typed): one row with Change / Upload
 * - editing: the text area for pasting or reviewing the extracted text
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
  const [editing, setEditing] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const hasContent = Boolean(value.trim() || seeded)

  const mutation = useMutation({
    mutationFn: parseCv,
    onMutate: () => setWarnings([]),
    onSuccess: (data) => {
      setWarnings(data.warnings ?? [])
      setEditing(false)
      onChange(data.extracted_text)
    },
  })

  const openEditor = () => {
    onEdit?.()
    setEditing(true)
  }

  useEffect(() => {
    if (editing) textareaRef.current?.focus()
  }, [editing])

  const handleFile = useCallback(
    (file: File | null | undefined) => {
      if (!file) return
      onEdit?.()
      setFileName(file.name)
      mutation.mutate(file)
    },
    [mutation, onEdit],
  )

  const words = countWords(value)
  const sourceLabel = fileName
    ? fileName
    : seeded
      ? 'Resume carried from previous tool'
      : 'Resume ready'
  const parseError = mutation.error
    ? mutation.error instanceof Error
      ? mutation.error.message
      : 'Failed to parse resume. Please try again.'
    : null
  const shownError = error ?? parseError ?? undefined

  let body
  if (mutation.isPending) {
    body = (
      <div role="status">
        <List boxed aria-busy="true" aria-label="Resume source">
          <Row overflow="truncate">
            <RowBody>
              <RowTitle title={fileName ?? undefined}>
                <span className="tool-spinner" aria-hidden="true" />
                Reading {fileName ?? 'your resume'}…
              </RowTitle>
            </RowBody>
          </Row>
        </List>
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
          <Textarea ref={textareaRef} rows={rows} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
        </Field>
        <Cluster>
          <FileInput
            size="sm"
            label="Upload a file instead"
            accept={ACCEPT}
            clearable={false}
            onFilesChange={([file]) => handleFile(file)}
          />
          {hasContent ? (
            <Button type="button" variant="link" className="tool-link" onClick={() => setEditing(false)}>
              Done
            </Button>
          ) : null}
        </Cluster>
      </Stack>
    )
  } else if (hasContent) {
    body = (
      <Field error={shownError}>
        <List boxed aria-label="Resume source">
          <Row overflow="truncate">
            <RowBody>
              <RowTitle title={sourceLabel}>{sourceLabel}</RowTitle>
            </RowBody>
            {words > 0 ? <RowMeta>{words === 1 ? '1 word' : `${words.toLocaleString()} words`}</RowMeta> : null}
            <RowActions reveal={false}>
              <Button type="button" variant="secondary" size="sm" onClick={openEditor}>
                Change
              </Button>
              <FileInput
                size="sm"
                label="Upload"
                accept={ACCEPT}
                clearable={false}
                onFilesChange={([file]) => handleFile(file)}
              />
            </RowActions>
          </Row>
        </List>
      </Field>
    )
  } else {
    body = (
      <Stack gap={2}>
        <Field label="Resume" error={shownError}>
          <FileInput
            variant="dropzone"
            accept={ACCEPT}
            hint="Drop a PDF or DOCX here"
            clearable={false}
            onFilesChange={([file]) => handleFile(file)}
          />
        </Field>
        <div>
          <Button type="button" variant="link" className="tool-link" onClick={openEditor}>
            Paste text instead
          </Button>
        </div>
      </Stack>
    )
  }

  return (
    <Stack gap={2}>
      {body}
      {warnings.length > 0 ? (
        <Notice tone="warning">
          {warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </Notice>
      ) : null}
    </Stack>
  )
}
