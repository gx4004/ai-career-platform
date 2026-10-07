import { useEffect, useId, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Upload } from 'lucide-react'
import { Button, FileInput, Notice } from '#/components/kit'
import { SAMPLE_RESUME_TEXT } from '#/components/tooling/sampleResume'
import { parseCv } from '#/lib/api/client'
import { writeWorkflowContext } from '#/lib/tools/drafts'
import { setResumeCarry } from '#/lib/tools/resumeCarryStore'
import { uploadErrorText } from '#/lib/tools/uploadErrors'

/** Inline resume upload: parses the file (or takes the sample), then hands off to the Resume Analyzer for review. */
export function DashboardResumeUpload() {
  const navigate = useNavigate()
  // A file that could not be read leaves the dropzone (a new key empties it), so it does not sit there as if chosen.
  const [pickKey, setPickKey] = useState(0)

  const mutation = useMutation({
    mutationFn: parseCv,
    onError: () => setPickKey((key) => key + 1),
    onSuccess: (data, file) => {
      // The carry names the file, so the Resume Analyzer shows "resume.pdf" rather than a hand-off from a tool.
      setResumeCarry(data.extracted_text, file.name)
      writeWorkflowContext({
        resumeText: data.extracted_text,
        resumePendingReview: true,
        resumeOrigin: 'dashboard',
        resumeSource: undefined,
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
    writeWorkflowContext({
      resumeText: SAMPLE_RESUME_TEXT,
      resumePendingReview: true,
      resumeOrigin: 'dashboard',
      resumeSource: undefined,
      updatedAt: Date.now(),
    })
    navigate({ to: '/resume' })
  }

  const error = mutation.error ? uploadErrorText(mutation.error, 'try the sample resume') : null
  const errorId = useId()
  const errorRef = useRef<HTMLDivElement | null>(null)
  // A phone's tab tray can hide the line under the dropzone: bring the message into view (no further than needed).
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [error])

  return (
    <div className="dash-upload">
      <FileInput
        key={pickKey}
        variant="dropzone"
        // The tool pages' dropzone (consistency-F08), primary here: it is the newcomer's one next step.
        icon={<Upload />}
        buttonVariant="primary"
        aria-label="Resume file"
        aria-describedby={error ? errorId : undefined}
        accept=".pdf,.docx"
        hint={'PDF or DOCX, up to 10\u00a0MB'}
        disabled={mutation.isPending}
        invalid={Boolean(error)}
        onFilesChange={([file]) => handleFile(file)}
      />
      {/* Right under the dropzone it explains: further down, on a phone, it fell under the tab tray. */}
      {mutation.isPending ? <Notice role="status">Parsing your resume…</Notice> : null}
      {error ? (
        <Notice ref={errorRef} id={errorId} tone="danger" className="dash-upload__error">
          {error}
        </Notice>
      ) : null}
      <div>
        <Button type="button" variant="link" size="sm" disabled={mutation.isPending} onClick={trySample}>
          Try with a sample resume
        </Button>
      </div>
    </div>
  )
}
