import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { useBreakpoint } from '#/hooks/use-breakpoint'
import { Button } from '#/components/ui/button'
import { Label } from '#/components/ui/label'
import { Textarea } from '#/components/ui/textarea'
import { DropzoneHero } from '#/components/tooling/DropzoneHero'
import { JobImportCard } from '#/components/tooling/JobImportCard'
import {
  ToolInputHero,
  ToolPageLoading,
  ToolPageShell,
  ToolStatusInline,
  useResumeEditorCollapse,
  useToolPageState,
} from '#/components/tooling/toolPageShared'
import { writeWorkflowContext } from '#/lib/tools/drafts'

export function ResumeToolPage() {
  const {
    tool,
    config,
    draft,
    setField,
    mutation,
    bridge,
    errors,
    handleSubmit,
  } = useToolPageState('resume')

  const resumeField = config.fields.find((field) => field.name === 'resumeText')!
  const jobField = config.fields.find((field) => field.name === 'jobDescription')
  const resumeFieldId = 'resume-resumeText'
  const [phase, setPhase] = useState<'upload' | 'form'>(
    draft.resumeText.trim() || bridge.seededResume ? 'form' : 'upload',
  )
  const bp = useBreakpoint()
  const isMobile = bp === 'mobile'
  const [showOptionalJob, setShowOptionalJob] = useState(
    Boolean(bridge.seededJob || draft.jobDescription.trim()),
  )
  const hasResumeContent = Boolean(draft.resumeText.trim() || bridge.seededResume)
  const { resumeEditorCollapsed, openResumeEditor: revealResumeEditor, collapseResumeEditor } =
    useResumeEditorCollapse(hasResumeContent, hasResumeContent)

  const clearPendingResumeReview = () => {
    writeWorkflowContext({
      resumePendingReview: false,
      updatedAt: Date.now(),
    })
  }

  const openResumeEditor = () => {
    clearPendingResumeReview()
    revealResumeEditor()
  }

  const collapseResumeEditorAfterParse = (text: string) => {
    clearPendingResumeReview()
    setField('resumeText', text)
    collapseResumeEditor()
  }

  const heroSubtitle = phase === 'upload'
    ? 'Upload a PDF or DOCX, then review the extracted text before you run the analyzer.'
    : 'Edit the extracted text, add a target role if you want, then run the analyzer.'

  return (
    <ToolPageShell
      toolId="resume"
      bodyClassName="resume-bespoke-page"
      hero={<ToolInputHero toolId="resume" subtitle={heroSubtitle} />}
    >
      {mutation.isPending ? (
        <ToolPageLoading toolId="resume" className="resume-loading-shell" />
      ) : phase === 'upload' ? (
        <section className="resume-upload-stage">
          <DropzoneHero
            accent={tool.accent}
            onParsed={(text) => {
              collapseResumeEditorAfterParse(text)
              setPhase('form')
            }}
            onPasteText={() => {
              openResumeEditor()
              setPhase('form')
            }}
          />
        </section>
      ) : (
        <form
          aria-label={`${tool.label} input form`}
          className="resume-form-section"
          onSubmit={(event) => {
            event.preventDefault()
            handleSubmit()
          }}
        >
          <section className="resume-upload-stage">
            <DropzoneHero
              accent={tool.accent}
              compact
              collapseOnSuccess
              preLoaded={hasResumeContent}
              preLoadedLabel={bridge.seededResume ? 'Resume carried from previous tool' : undefined}
              onParsed={(text) => {
                collapseResumeEditorAfterParse(text)
              }}
              onPasteText={() => {
                openResumeEditor()
                document.getElementById(resumeFieldId)?.focus()
              }}
            />
          </section>

          {resumeEditorCollapsed && hasResumeContent ? (
            isMobile ? null : (
              <ToolStatusInline
                label="Resume parsed successfully. Open the extracted text only if you want to review or edit it."
                onChangeResume={openResumeEditor}
              />
            )
          ) : isMobile && hasResumeContent ? null : (
            <section className="resume-editor-shell">
              <div className="resume-editor-header">
                <Label className="tool-field-label" htmlFor={resumeFieldId}>
                  <span>{resumeField.label}</span>
                  <span className="small-copy muted-copy">Required</span>
                </Label>
                <p className="resume-inline-note">
                  Paste resume text manually or review the extracted text before you analyze it.
                </p>
              </div>
              <Textarea
                id={resumeFieldId}
                rows={resumeField.rows}
                className="resume-paste-textarea"
                value={String(draft.resumeText ?? '')}
                placeholder={resumeField.placeholder}
                onChange={(event) => setField('resumeText', event.target.value as never)}
              />
              {errors.resumeText ? (
                <p className="small-copy" style={{ color: 'var(--destructive)' }}>
                  {errors.resumeText}
                </p>
              ) : null}
            </section>
          )}

          {jobField ? (
            <section className="resume-optional-shell">
              <div className="resume-optional-header">
                <p className="section-title">Target job description</p>
                <p className="small-copy muted-copy">
                  Optional. Add one role if you want more specific keyword and fit feedback.
                </p>
                {bridge.seededJob ? (
                  <p className="resume-inline-note">
                    A recent job description was loaded into this step. Replace or edit it if
                    needed.
                  </p>
                ) : null}
              </div>
              {!showOptionalJob ? (
                <div className="resume-optional-toggle">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowOptionalJob(true)}
                  >
                    Add target job description
                  </Button>
                </div>
              ) : (
                <>
                  {tool.supportsJobImport ? (
                    <JobImportCard
                      onImported={(description) => setField('jobDescription', description)}
                    />
                  ) : null}
                  <div className="grid gap-2">
                    <Label className="tool-field-label" htmlFor="resume-jobDescription">
                      <span>{jobField.label}</span>
                      <span className="small-copy muted-copy">Optional</span>
                    </Label>
                    <Textarea
                      id="resume-jobDescription"
                      rows={jobField.rows}
                      value={String(draft.jobDescription ?? '')}
                      placeholder={jobField.placeholder}
                      onChange={(event) => setField('jobDescription', event.target.value as never)}
                    />
                    {errors.jobDescription ? (
                      <p className="small-copy" style={{ color: 'var(--destructive)' }}>
                        {errors.jobDescription}
                      </p>
                    ) : null}
                  </div>
                </>
              )}
            </section>
          ) : null}

          {mutation.error ? (
            <p className="resume-error-inline small-copy" style={{ color: 'var(--destructive)' }}>
              {mutation.error instanceof Error ? mutation.error.message : 'This run failed.'}
            </p>
          ) : null}

          <div className="resume-submit-area" data-testid="resume-sticky-submit">
            <div className="resume-submit-bar">
              <Button
                type="submit"
                size="lg"
                className="resume-submit-btn"
                style={{ background: tool.accent, color: '#ffffff' }}
                disabled={mutation.isPending}
              >
                {tool.entryPointLabel}
                <ArrowRight size={16} />
              </Button>
            </div>
          </div>
        </form>
      )}
    </ToolPageShell>
  )
}
