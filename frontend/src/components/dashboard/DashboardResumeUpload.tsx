import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { FileInput, Notice } from '#/components/kit'
import { parseCv } from '#/lib/api/client'
import { writeWorkflowContext } from '#/lib/tools/drafts'

/** Slim inline resume upload: parses the file, then hands off to the Resume Analyzer for review. */
export function DashboardResumeUpload() {
  const navigate = useNavigate()

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
    mutation.mutate(file)
  }

  const error = mutation.error
    ? mutation.error instanceof Error
      ? mutation.error.message
      : 'Failed to parse resume. Please try again.'
    : null

  return (
    <div className="dash-upload" data-tour="hero-cta">
      <FileInput
        variant="dropzone"
        buttonVariant="primary"
        aria-label="Resume file"
        accept=".pdf,.docx"
        hint="PDF or DOCX. Every tool builds on it. You can also drop a file here."
        disabled={mutation.isPending}
        onFilesChange={([file]) => handleFile(file)}
      />
      {mutation.isPending ? <Notice role="status">Parsing your resume…</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </div>
  )
}
