import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Button, FileInput, Notice } from '#/components/kit'
import { SAMPLE_RESUME_TEXT } from '#/components/tooling/sampleResume'
import { parseCv } from '#/lib/api/client'
import { writeWorkflowContext } from '#/lib/tools/drafts'
import { setResumeCarry } from '#/lib/tools/resumeCarryStore'

/** Inline resume upload: parses the file (or takes the sample), then hands off to the Resume Analyzer for review. */
export function DashboardResumeUpload() {
  const navigate = useNavigate()

  const mutation = useMutation({
    mutationFn: parseCv,
    onSuccess: (data, file) => {
      // The carry names the file, so the Resume Analyzer shows "resume.pdf" rather than a hand-off from a tool.
      setResumeCarry(data.extracted_text, file.name)
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
    mutation.reset() // a new pick clears the last parse error
    mutation.mutate(file)
  }

  // The sample is made up and says so on its first line; it goes to the tool as a pending review like an upload.
  const trySample = () => {
    writeWorkflowContext({ resumeText: SAMPLE_RESUME_TEXT, resumePendingReview: true, updatedAt: Date.now() })
    navigate({ to: '/resume' })
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
        hint="PDF or DOCX. You can also drop a file here."
        disabled={mutation.isPending}
        invalid={Boolean(error)}
        onFilesChange={([file]) => handleFile(file)}
      />
      <div>
        <Button type="button" variant="link" size="sm" disabled={mutation.isPending} onClick={trySample}>
          Try with a sample resume
        </Button>
      </div>
      {mutation.isPending ? <Notice role="status">Parsing your resume…</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </div>
  )
}
