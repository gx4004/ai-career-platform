import { useMemo, useState } from 'react'
import { AlertCircle, ArrowRight } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Textarea } from '#/components/ui/textarea'
import { PageFrame } from '#/components/app/PageFrame'
import { WorkbenchArt } from '#/components/illustrations/WorkbenchArt'
import { CvUploadCard } from '#/components/tooling/CvUploadCard'
import { JobImportCard } from '#/components/tooling/JobImportCard'
import { useToolDraft } from '#/hooks/useToolDraft'
import { useToolMutation } from '#/hooks/useToolMutation'
import { useWorkflowBridge } from '#/hooks/useWorkflowBridge'
import { workflowConfigs, validateWorkflowDraft } from '#/lib/tools/workflowConfigs'
import { tools } from '#/lib/tools/registry'
import type { ToolId } from '#/lib/tools/registry'
import { toolAccentStyle } from '#/lib/tools/styleUtils'

export function ToolRouteScreen({ toolId }: { toolId: ToolId }) {
  const tool = tools[toolId]
  const config = workflowConfigs[toolId]
  const { draft, setDraft, setField } = useToolDraft(toolId, config.defaults)
  const mutation = useToolMutation(tool)
  const bridge = useWorkflowBridge(toolId, draft, setDraft)
  const [errors, setErrors] = useState<Partial<Record<keyof typeof draft, string>>>({})

  const handleSubmit = () => {
    const nextErrors = validateWorkflowDraft(config, draft)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    mutation.mutate({ payload: config.buildPayload(draft), draft })
  }

  const formFields = useMemo(() => config.fields, [config.fields])

  return (
    <PageFrame>
      <section className="tool-screen content-max">
        <div className="tool-hero section-card grid gap-4 p-6">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="outline">{config.badge}</Badge>
            <Badge
              variant="outline"
              style={{ borderColor: tool.accent, color: tool.accent }}
            >
              {tool.label}
            </Badge>
          </div>
          <div className="grid gap-2">
            <h1 className="page-title text-balance">{config.title}</h1>
            <p className="muted-copy">{config.description}</p>
          </div>
        </div>
        {bridge.banner ? (
          <div className="tool-seed-banner">
            <AlertCircle size={16} />
            <span>{bridge.banner}</span>
          </div>
        ) : null}
        <div className="tool-layout">
          <div className="ra-form-wrap tool-panel">
            <form
              aria-label={`${tool.label} input form`}
              className="tool-form-grid"
              onSubmit={(event) => {
                event.preventDefault()
                handleSubmit()
              }}
            >
              {formFields.map((field) => (
                <div key={field.name} className="grid gap-2">
                  {field.name === 'resumeText' && tool.supportsCvUpload ? (
                    <CvUploadCard onParsed={(text) => setField('resumeText', text)} />
                  ) : null}
                  {field.name === 'jobDescription' && tool.supportsJobImport ? (
                    <JobImportCard
                      onImported={(description) =>
                        setField('jobDescription', description)
                      }
                    />
                  ) : null}
                  <div>
                    <Label className="tool-field-label" htmlFor={`${toolId}-${field.name}`}>
                      <span>{field.label}</span>
                      {field.required ? (
                        <span className="small-copy muted-copy">Required</span>
                      ) : null}
                    </Label>
                    {field.kind === 'textarea' ? (
                      <Textarea
                        id={`${toolId}-${field.name}`}
                        rows={field.rows}
                        value={String(draft[field.name] ?? '')}
                        placeholder={field.placeholder}
                        onChange={(event) =>
                          setField(field.name, event.target.value as never)
                        }
                      />
                    ) : field.kind === 'choice' ? (
                      <div className="flex flex-wrap gap-2">
                        {field.choices?.map((choice) => (
                          <Button
                            key={choice.value}
                            type="button"
                            variant={
                              draft[field.name] === choice.value ? 'default' : 'outline'
                            }
                            onClick={() =>
                              setField(field.name, choice.value as never)
                            }
                          >
                            {choice.label}
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <Input
                        id={`${toolId}-${field.name}`}
                        type={field.kind === 'number' ? 'number' : 'text'}
                        value={String(draft[field.name] ?? '')}
                        placeholder={field.placeholder}
                        min={field.min}
                        max={field.max}
                        onChange={(event) =>
                          setField(
                            field.name,
                            (field.kind === 'number'
                              ? Number(event.target.value || 0)
                              : event.target.value) as never,
                          )
                        }
                      />
                    )}
                    {field.description ? (
                      <p className="tool-helper mt-2">{field.description}</p>
                    ) : null}
                    {errors[field.name] ? (
                      <p className="small-copy mt-2" style={{ color: 'var(--destructive)' }}>
                        {errors[field.name]}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </form>
          </div>
          <aside className="tool-info-card">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <p className="eyebrow">Guidance</p>
                {config.guidance.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </div>
              <div className="section-card grid gap-3 p-4">
                <WorkbenchArt accent={tool.accent} variant="tool" />
                <div className="grid gap-1">
                  <h3 className="section-title">{config.illustrationTitle}</h3>
                  <p className="small-copy muted-copy">{config.illustrationBody}</p>
                </div>
              </div>
            </div>
          </aside>
        </div>
        <div className="tool-sticky-wrap">
          <div
            className="tool-sticky-bar"
            style={toolAccentStyle(tool.accent)}
          >
            <div className="grid gap-1">
              <p className="section-title">{tool.label}</p>
              <p className="small-copy muted-copy">
                Keep the same context moving through the workflow.
              </p>
            </div>
            <div className="grid gap-2">
              {mutation.isPending ? (
                <div className="tool-loading-box">
                  <span className="tool-spinner" />
                  <span>{config.loadingText}</span>
                </div>
              ) : null}
              <Button
                type="button"
                className="button-hero-primary"
                size="lg"
                onClick={handleSubmit}
                disabled={mutation.isPending}
              >
                {tool.entryPointLabel}
                <ArrowRight size={16} />
              </Button>
              {mutation.error ? (
                <p className="small-copy" style={{ color: 'var(--destructive)' }}>
                  {mutation.error instanceof Error
                    ? mutation.error.message
                    : 'This run failed.'}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </PageFrame>
  )
}
