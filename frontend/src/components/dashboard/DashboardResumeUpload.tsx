import { useRef, useState, type DragEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { FileUp } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { parseCv } from '#/lib/api/client'
import { writeWorkflowContext } from '#/lib/tools/drafts'

/** Slim inline resume upload: parses the file, then hands off to the Resume Analyzer for review. */
export function DashboardResumeUpload() {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: parseCv,
    onSuccess: (data) => {
      writeWorkflowContext({
        resumeText: data.extracted_text,
        resumePendingReview: true,
        updatedAt: Date.now(),
      })
      navigate({ to: '/resume' })
    },
  })

  const handleFile = (file: File | null | undefined) => {
    if (!file) return
    setFileName(file.name)
    mutation.mutate(file)
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    handleFile(event.dataTransfer.files[0])
  }

  const error = mutation.error
    ? mutation.error instanceof Error
      ? mutation.error.message
      : 'Failed to parse resume. Please try again.'
    : null

  return (
    <div
      className="dash-upload"
      data-tour="hero-cta"
      data-dragging={dragging || undefined}
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <div className="dash-upload__text">
        <p className="dash-upload__title">
          {mutation.isPending ? `Parsing ${fileName ?? 'your resume'}…` : 'Upload your resume'}
        </p>
        <p className="dash-upload__hint">
          PDF or DOCX. Every tool builds on it. You can also drop a file here.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        loading={mutation.isPending}
        onClick={() => inputRef.current?.click()}
      >
        <FileUp size={14} aria-hidden="true" /> Choose file
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx"
        className="hidden"
        aria-label="Resume file"
        onChange={(event) => handleFile(event.target.files?.[0])}
      />
      {error ? (
        <p className="dash-upload__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
