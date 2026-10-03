import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button } from '#/components/ui/button'
import { Label } from '#/components/ui/label'
import { Textarea } from '#/components/ui/textarea'
import { parseCv } from '#/lib/api/client'

function countWords(text: string) {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

/**
 * Compact resume control for the tool input pages.
 *
 * - empty: a modest dropzone with Choose file / Paste text instead
 * - has text (uploaded, carried or typed): a bordered row with Change / Upload
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
  note,
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
  note?: string
  /** Called when the user opens the editor or replaces the resume. */
  onEdit?: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [editing, setEditing] = useState(false)
  const [dragOver, setDragOver] = useState(false)
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

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept=".pdf,.docx"
      className="hidden"
      aria-label="Resume file"
      onChange={(event) => {
        handleFile(event.target.files?.[0])
        event.target.value = ''
      }}
    />
  )

  const words = countWords(value)
  const sourceLabel = fileName
    ? fileName
    : seeded
      ? 'Resume carried from previous tool'
      : 'Resume ready'

  let body
  if (mutation.isPending) {
    body = (
      <div className="tool-source tool-source--busy" role="status">
        <span className="tool-spinner" aria-hidden="true" />
        <span>Reading {fileName ?? 'your resume'}…</span>
      </div>
    )
  } else if (editing) {
    body = (
      <>
        <Textarea
          id={id}
          ref={textareaRef}
          rows={rows}
          aria-invalid={Boolean(error)}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
        <div className="tool-source-actions">
          <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            Upload a file instead
          </Button>
          {hasContent ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Done
            </Button>
          ) : null}
        </div>
      </>
    )
  } else if (hasContent) {
    body = (
      <div className="tool-source tool-status-inline">
        <span className="tool-source-name">{sourceLabel}</span>
        {words > 0 ? <span className="tool-source-meta">{words.toLocaleString()} words</span> : null}
        <span className="tool-source-spacer" />
        <Button type="button" variant="outline" size="sm" onClick={openEditor}>
          Change
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
          Upload
        </Button>
      </div>
    )
  } else {
    body = (
      <div
        className="tool-dropzone"
        data-drag={dragOver || undefined}
        onDragOver={(event) => {
          event.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragOver(false)
          handleFile(event.dataTransfer.files[0])
        }}
      >
        <p className="tool-dropzone-text">
          {dragOver ? 'Drop the file to upload' : 'Drop a PDF or DOCX here'}
        </p>
        <div className="tool-source-actions">
          <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            Choose file
          </Button>
          <Button type="button" variant="link" size="sm" onClick={openEditor}>
            Paste text instead
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="tool-field">
      <div className="tool-field-head">
        <Label className="tool-field-label" htmlFor={editing ? id : undefined}>
          <span>{label}</span>
        </Label>
      </div>
      {note ? <p className="tool-field-note">{note}</p> : null}
      {body}
      {fileInput}
      {warnings.length > 0 ? (
        <ul className="tool-source-warnings" role="status">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      {mutation.error ? (
        <p className="tool-field-error">
          {mutation.error instanceof Error
            ? mutation.error.message
            : 'Failed to parse resume. Please try again.'}
        </p>
      ) : null}
      {error ? <p className="tool-field-error">{error}</p> : null}
    </div>
  )
}
