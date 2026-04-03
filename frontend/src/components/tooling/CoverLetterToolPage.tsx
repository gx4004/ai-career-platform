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

export function CoverLetterToolPage() {
  const {
    tool,
    config,
    draft,
    setField,
    mutation,
    bridge,
    errors,
    handleSubmit,
  } = useToolPageState('cover-letter')

  const resumeField = config.fields.find((field) => field.name === 'resumeText')!
  const jobField = config.fields.find((field) => field.name === 'jobDescription')!
  const toneField = config.fields.find((field) => field.name === 'tone')!
  const [phase, setPhase] = useState<'upload' | 'form'>(
    draft.resumeText.trim() || bridge.seededResume ? 'form' : 'upload',
  )
  const hasResumeContent = Boolean(draft.resumeText.trim() || bridge.seededResume)
  const { resumeEditorCollapsed, openResumeEditor, collapseResumeEditor } =
    useResumeEditorCollapse(hasResumeContent, hasResumeContent)

  const heroSubtitle = phase === 'upload'
    ? 'Start with your resume, then add one concrete job description and pick the tone.'
    : 'Review your resume, paste the posting, choose a tone, and generate a first draft.'

  return (
    <ToolPageShell
      toolId="cover-letter"
      bodyClassName="cover-letter-bespoke-page"
      hero={<ToolInputHero toolId="cover-letter" subtitle={heroSubtitle} />}
    >
      {mutation.isPending ? (
        <ToolPageLoading toolId="cover-letter" className="cover-letter-loading-shell" />
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
          <section className="resume-editor-shell">
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
                document.getElementById('cover-letter-resumeText')?.focus()
              }}
            />
            {resumeEditorCollapsed && hasResumeContent ? (
              <ToolStatusInline
                label="Resume parsed successfully. Open the extracted text only if you want to adjust it before generating the draft."
                onChangeResume={openResumeEditor}
              />
            ) : (
              <div className="grid gap-2">
                <Label className="tool-field-label" htmlFor="cover-letter-resumeText">
                  <span>{resumeField.label}</span>
                  <span className="small-copy muted-copy">Required</span>
                </Label>
                {getSeededFieldNote('resumeText', bridge) ? (
                  <p className="tool-fs-field-note">
                    {getSeededFieldNote('resumeText', bridge)}
                  </p>
                ) : null}
                <Textarea
                  id="cover-letter-resumeText"
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
              </div>
            )}
          </section>

          <section className="resume-optional-shell">
            <div className="resume-optional-header">
              <p className="section-title">Target job description</p>
              <p className="small-copy muted-copy">
                Keep this specific so the generated letter stays focused on one role.
              </p>
            </div>
            <JobImportCard
              onImported={(description) => setField('jobDescription', description)}
            />
            <div className="grid gap-2">
              <Label className="tool-field-label" htmlFor="cover-letter-jobDescription">
                <span>{jobField.label}</span>
                <span className="small-copy muted-copy">Required</span>
              </Label>
              {getSeededFieldNote('jobDescription', bridge) ? (
                <p className="tool-fs-field-note">
                  {getSeededFieldNote('jobDescription', bridge)}
                </p>
              ) : null}
              <Textarea
                id="cover-letter-jobDescription"
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
            <div className="grid gap-2" aria-label="Tone controls">
              <Label className="tool-field-label">
                <span>{toneField.label}</span>
                <span className="small-copy muted-copy">Optional</span>
              </Label>
              <div className="flex flex-wrap gap-2">
                {toneField.choices?.map((choice) => (
                  <Button
                    key={choice.value}
                    type="button"
                    variant={draft.tone === choice.value ? 'default' : 'outline'}
                    onClick={() => setField('tone', choice.value as never)}
                  >
                    {choice.label}
                  </Button>
                ))}
              </div>
            </div>
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
