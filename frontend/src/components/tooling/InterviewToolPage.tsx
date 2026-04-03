import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
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
  getSeededFieldNote,
  useResumeEditorCollapse,
  useToolPageState,
} from '#/components/tooling/toolPageShared'
import { cn } from '#/lib/utils'

const questionCounts = [4, 6, 8, 10]

export function InterviewToolPage() {
  const {
    tool,
    config,
    draft,
    setField,
    mutation,
    bridge,
    errors,
    handleSubmit,
  } = useToolPageState('interview')

  const resumeField = config.fields.find((field) => field.name === 'resumeText')!
  const jobField = config.fields.find((field) => field.name === 'jobDescription')!
  const [phase, setPhase] = useState<'upload' | 'form'>(
    draft.resumeText.trim() || bridge.seededResume ? 'form' : 'upload',
  )
  const hasResumeContent = Boolean(draft.resumeText.trim() || bridge.seededResume)
  const { resumeEditorCollapsed, openResumeEditor, collapseResumeEditor } =
    useResumeEditorCollapse(hasResumeContent, hasResumeContent)

  const heroSubtitle = phase === 'upload'
    ? 'Start with your resume, add the role, then choose how deep you want the practice deck to be.'
    : 'Check the resume and job description first, then choose how many questions you want to practice.'

  return (
    <ToolPageShell
      toolId="interview"
      bodyClassName="interview-bespoke-page"
      hero={<ToolInputHero toolId="interview" subtitle={heroSubtitle} />}
    >
      {mutation.isPending ? (
        <ToolPageLoading toolId="interview" className="interview-loading-shell" />
      ) : phase === 'upload' ? (
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
      ) : (
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
                  document.getElementById('interview-resumeText')?.focus()
                }}
              />
              {resumeEditorCollapsed && hasResumeContent ? (
                <ToolStatusInline
                  label="Resume parsed and ready. Open the extracted text only if you want to tweak it before generating questions."
                  onChangeResume={openResumeEditor}
                />
              ) : (
                <div className="grid gap-2">
                  <Label className="tool-field-label" htmlFor="interview-resumeText">
                    <span>{resumeField.label}</span>
                    <span className="small-copy muted-copy">Required</span>
                  </Label>
                  {getSeededFieldNote('resumeText', bridge) ? (
                    <p className="tool-fs-field-note">
                      {getSeededFieldNote('resumeText', bridge)}
                    </p>
                  ) : null}
                  <Textarea
                    id="interview-resumeText"
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
            </section>

            <section className="jobmatch-panel">
              <JobImportCard
                onImported={(description) => setField('jobDescription', description)}
              />
              <div className="grid gap-2">
                <Label className="tool-field-label" htmlFor="interview-jobDescription">
                  <span>{jobField.label}</span>
                  <span className="small-copy muted-copy">Required</span>
                </Label>
                {getSeededFieldNote('jobDescription', bridge) ? (
                  <p className="tool-fs-field-note">
                    {getSeededFieldNote('jobDescription', bridge)}
                  </p>
                ) : null}
                <Textarea
                  id="interview-jobDescription"
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
            </section>
          </div>

          <section className="interview-count-row" aria-label="Question count quick picks">
            <div>
              <p className="section-title">Practice depth</p>
              <p className="small-copy muted-copy">Choose how many questions to generate.</p>
            </div>
            <div className="interview-count-picker">
              {questionCounts.map((count) => (
                <button
                  key={count}
                  type="button"
                  aria-label={`${count} questions`}
                  className={cn(
                    'interview-count-pill',
                    draft.numQuestions === count && 'is-active',
                  )}
                  onClick={() => setField('numQuestions', count as never)}
                >
                  <span className="interview-count-value">{count}</span>
                  <span className="interview-count-label">questions</span>
                </button>
              ))}
            </div>
            {errors.numQuestions ? (
              <p className="small-copy" style={{ color: 'var(--destructive)' }}>
                {errors.numQuestions}
              </p>
            ) : null}
          </section>

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
      )}
    </ToolPageShell>
  )
}
