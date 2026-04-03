import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Label } from '#/components/ui/label'
import { Textarea } from '#/components/ui/textarea'
import { DropzoneHero } from '#/components/tooling/DropzoneHero'
import { JobImportCard } from '#/components/tooling/JobImportCard'
import { ToolHeroIllustration } from '#/components/tooling/ToolHeroIllustration'
import {
  ParsedResumeNotice,
  ToolPageLoading,
  ToolPageShell,
  getSeededFieldNote,
  useResumeEditorCollapse,
  useToolPageState,
} from '#/components/tooling/toolPageShared'
export function JobMatchToolPage() {
  const {
    tool,
    config,
    draft,
    setField,
    mutation,
    bridge,
    errors,
    handleSubmit,
  } = useToolPageState('job-match')

  const resumeField = config.fields.find((field) => field.name === 'resumeText')!
  const jobField = config.fields.find((field) => field.name === 'jobDescription')!
  const [phase, setPhase] = useState<'upload' | 'form'>(
    draft.resumeText.trim() || bridge.seededResume ? 'form' : 'upload',
  )
  const hasResumeContent = Boolean(draft.resumeText.trim() || bridge.seededResume)
  const { resumeEditorCollapsed, openResumeEditor, collapseResumeEditor } =
    useResumeEditorCollapse(hasResumeContent, hasResumeContent)

  return (
    <ToolPageShell toolId="job-match" bodyClassName="tool-fs-body--wide jobmatch-page">
      {mutation.isPending ? (
        <ToolPageLoading toolId="job-match" className="resume-loading-shell" />
      ) : phase === 'upload' ? (
        <>
          <section className="resume-bespoke-header">
            <div className="resume-bespoke-visual">
              <ToolHeroIllustration toolId="job-match" accent={tool.accent} loading={false} />
            </div>
            <h1 className="resume-bespoke-title">{tool.label}</h1>
            <p className="resume-bespoke-subtitle">
              Start with your resume, then compare it against one specific job description.
            </p>
          </section>

          <section className="resume-upload-stage">
            <DropzoneHero
              accent={tool.accent}
              onParsed={(text) => {
                setField('resumeText', text)
                collapseResumeEditor()
                setPhase('form')
              }}
              onPasteText={() => {
                openResumeEditor()
                setPhase('form')
              }}
            />
          </section>
        </>
      ) : (
        <>
          <section className="resume-bespoke-header">
            <div className="resume-bespoke-visual">
              <ToolHeroIllustration toolId="job-match" accent={tool.accent} loading={false} />
            </div>
            <h1 className="resume-bespoke-title">{tool.label}</h1>
            <p className="resume-bespoke-subtitle">
              Review the resume text on the left and the full posting on the right before you run
              the match.
            </p>
          </section>

          <form
            aria-label={`${tool.label} input form`}
            className="resume-form-section"
            onSubmit={(event) => {
              event.preventDefault()
              handleSubmit()
            }}
          >
            <div className="jobmatch-split">
              <section className="jobmatch-panel">
                <div className="tool-fs-section">
                  <DropzoneHero
                    accent={tool.accent}
                    compact
                    collapseOnSuccess
                    preLoaded={hasResumeContent}
                    preLoadedLabel={bridge.seededResume ? 'Resume carried from previous tool' : undefined}
                    onParsed={(text) => {
                      setField('resumeText', text)
                      collapseResumeEditor()
                    }}
                    onPasteText={() => {
                      openResumeEditor()
                      document.getElementById('job-match-resumeText')?.focus()
                    }}
                  />
                  {resumeEditorCollapsed && hasResumeContent ? (
                    <ParsedResumeNotice
                      body="Resume parsed and ready. Open the extracted text only if you want to review or edit it."
                      onAction={openResumeEditor}
                    />
                  ) : (
                    <div className="grid gap-2">
                      <Label className="tool-field-label" htmlFor="job-match-resumeText">
                        <span>{resumeField.label}</span>
                        <span className="small-copy muted-copy">Required</span>
                      </Label>
                      {getSeededFieldNote('resumeText', bridge) ? (
                        <p className="tool-fs-field-note">
                          {getSeededFieldNote('resumeText', bridge)}
                        </p>
                      ) : null}
                      <Textarea
                        id="job-match-resumeText"
                        rows={resumeField.rows}
                        value={String(draft.resumeText ?? '')}
                        placeholder={resumeField.placeholder}
                        onChange={(event) => setField('resumeText', event.target.value as never)}
                      />
                      {errors.resumeText ? (
                        <p className="small-copy" style={{ color: 'var(--destructive)' }}>
                          {errors.resumeText}
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>
              </section>

              <section className="jobmatch-panel">
                <div className="tool-fs-section">
                  <JobImportCard
                    onImported={(description) => setField('jobDescription', description)}
                  />
                  <div className="grid gap-2">
                    <Label className="tool-field-label" htmlFor="job-match-jobDescription">
                      <span>{jobField.label}</span>
                      <span className="small-copy muted-copy">Required</span>
                    </Label>
                    {getSeededFieldNote('jobDescription', bridge) ? (
                      <p className="tool-fs-field-note">
                        {getSeededFieldNote('jobDescription', bridge)}
                      </p>
                    ) : null}
                    <Textarea
                      id="job-match-jobDescription"
                      rows={jobField.rows}
                      value={String(draft.jobDescription ?? '')}
                      placeholder={jobField.placeholder}
                      onChange={(event) =>
                        setField('jobDescription', event.target.value as never)
                      }
                    />
                    {errors.jobDescription ? (
                      <p className="small-copy" style={{ color: 'var(--destructive)' }}>
                        {errors.jobDescription}
                      </p>
                    ) : null}
                  </div>
                </div>
              </section>
            </div>

            <div className="tool-fs-footer">
              {mutation.error ? (
                <p className="tool-inline-error small-copy" style={{ color: 'var(--destructive)' }}>
                  {mutation.error instanceof Error ? mutation.error.message : 'This run failed.'}
                </p>
              ) : null}
              <div className="tool-fs-submit-row">
                <Button
                  type="submit"
                  size="lg"
                  className="tool-fs-submit-button"
                  style={{ background: tool.accent, color: '#ffffff' }}
                  disabled={mutation.isPending}
                >
                  {tool.entryPointLabel}
                  <ArrowRight size={16} />
                </Button>
              </div>
            </div>
          </form>
        </>
      )}
    </ToolPageShell>
  )
}
