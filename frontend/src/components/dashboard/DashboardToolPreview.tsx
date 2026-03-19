import { CheckCircle2, Sparkles } from 'lucide-react'
import { cn } from '#/lib/utils'
import { tools, type ToolId } from '#/lib/tools/registry'
import { toolAccentStyle } from '#/lib/tools/styleUtils'

type PreviewState = 'done' | 'active' | 'queued'

type PreviewPreset = {
  windowLabel: string
  title: string
  subtitle: string
  status: string
  stats: Array<{ label: string; value: string }>
  tracks: Array<{ label: string; detail: string; state: PreviewState }>
  noteTitle: string
  notes: string[]
  outcomes: string[]
}

const PREVIEW_PRESETS: Record<ToolId, PreviewPreset> = {
  resume: {
    windowLabel: 'Resume analysis',
    title: 'Shortlist readiness',
    subtitle: 'Three targeted edits before you send this version.',
    status: 'Resume synced',
    stats: [
      { label: 'Score', value: '84' },
      { label: 'ATS', value: '92%' },
      { label: 'Tone', value: 'Clear' },
    ],
    tracks: [
      { label: 'Structure', detail: 'Section hierarchy is clean and scannable.', state: 'done' },
      { label: 'Impact bullets', detail: 'Add stronger numeric proof to 2 recent roles.', state: 'active' },
      { label: 'Target role', detail: 'Tailor opening summary to the live role next.', state: 'queued' },
    ],
    noteTitle: 'Recommended next',
    notes: [
      'Compare it to a live role before changing layout again.',
      'Carry strong metrics into the match and cover-letter steps.',
    ],
    outcomes: ['Ready for Job Match', '2 strongest wins reused'],
  },
  'job-match': {
    windowLabel: 'Role match',
    title: 'Requirement coverage',
    subtitle: 'Strong alignment — a few fixable gaps remain before applying.',
    status: 'Role imported',
    stats: [
      { label: 'Fit', value: '78%' },
      { label: 'Coverage', value: '12/15' },
      { label: 'Gaps', value: '3' },
    ],
    tracks: [
      { label: 'Core requirements', detail: 'Design systems and collaboration map cleanly.', state: 'done' },
      { label: 'Keywords', detail: 'Add analytics and experimentation language.', state: 'active' },
      { label: 'Interview bridge', detail: 'Queue likely gap questions for practice next.', state: 'queued' },
    ],
    noteTitle: 'Decision cues',
    notes: [
      'Lead with systems ownership and stakeholder alignment.',
      'Use the cover letter to explain the experimentation gap directly.',
    ],
    outcomes: ['Cover letter context ready', 'Interview focus generated'],
  },
  'cover-letter': {
    windowLabel: 'Cover letter',
    title: 'Context-aware draft',
    subtitle: 'Role themes, proof points, and voice are already aligned.',
    status: 'Draft v2',
    stats: [
      { label: 'Themes', value: '6' },
      { label: 'Tone', value: 'Direct' },
      { label: 'Proof', value: '3 wins' },
    ],
    tracks: [
      { label: 'Opening', detail: 'Role-specific intro references the company brief.', state: 'done' },
      { label: 'Proof block', detail: 'Reinforce one metric with sharper business impact.', state: 'active' },
      { label: 'Close', detail: 'Sign-off is ready after final polish.', state: 'queued' },
    ],
    noteTitle: 'Submission polish',
    notes: [
      'Keep the body concise and role-specific.',
      'Pull one more quantified impact bullet from the resume version.',
    ],
    outcomes: ['Submission copy aligned', 'Resume + role context merged'],
  },
  interview: {
    windowLabel: 'Interview deck',
    title: 'Practice focus areas',
    subtitle: 'Questions mapped to the gaps most likely to come up live.',
    status: 'Deck generated',
    stats: [
      { label: 'Questions', value: '9' },
      { label: 'Themes', value: '3' },
      { label: 'Depth', value: 'Mid' },
    ],
    tracks: [
      { label: 'Behavioral stories', detail: 'Leadership and ambiguity examples are ready.', state: 'done' },
      { label: 'Gap handling', detail: 'Practice the analytics weakness explanation.', state: 'active' },
      { label: 'Closing answers', detail: 'Refine role-fit narrative with the company mission.', state: 'queued' },
    ],
    noteTitle: 'Practice guidance',
    notes: [
      'Start with concise structure, then add one metric or result.',
      'Reuse the same positioning from job match and cover letter.',
    ],
    outcomes: ['Interview narrative aligned', 'Gap answers prepped'],
  },
  career: {
    windowLabel: 'Career path',
    title: 'Direction comparison',
    subtitle: 'Compare the next move with realistic timing and tradeoffs.',
    status: 'Paths ranked',
    stats: [
      { label: 'Paths', value: '3' },
      { label: 'Window', value: '90d' },
      { label: 'Priority', value: 'Growth' },
    ],
    tracks: [
      { label: 'Best-fit path', detail: 'Product design lead path offers the strongest overlap.', state: 'done' },
      { label: 'Skill gaps', detail: 'Analytics depth remains the main blocker.', state: 'active' },
      { label: 'Proof plan', detail: 'Portfolio work should back the chosen path next.', state: 'queued' },
    ],
    noteTitle: 'Planning angle',
    notes: [
      'Choose one direction and align every tool around it.',
      'Use portfolio planning to turn gaps into visible proof quickly.',
    ],
    outcomes: ['Direction narrowed', 'Portfolio work prioritized'],
  },
  portfolio: {
    windowLabel: 'Portfolio plan',
    title: 'Proof-building roadmap',
    subtitle: 'Projects sequenced to close the most visible role gaps first.',
    status: 'Roadmap ready',
    stats: [
      { label: 'Projects', value: '4' },
      { label: 'Coverage', value: '82%' },
      { label: 'Launch', value: '6 wks' },
    ],
    tracks: [
      { label: 'Anchor project', detail: 'One systems case study is already framed.', state: 'done' },
      { label: 'Execution plan', detail: 'Prioritize the highest-signal proof first.', state: 'active' },
      { label: 'Publishing rhythm', detail: 'Turn outputs into reusable resume bullets next.', state: 'queued' },
    ],
    noteTitle: 'Roadmap lens',
    notes: [
      'Use each project to strengthen one concrete role gap.',
      'Feed finished proof back into the resume and job match steps.',
    ],
    outcomes: ['Proof work sequenced', 'Resume updates unlocked'],
  },
}

export function DashboardToolPreview({
  toolId,
  variant = 'hero',
  className,
}: {
  toolId: ToolId
  variant?: 'hero' | 'compact'
  className?: string
}) {
  const tool = tools[toolId]
  const preview = PREVIEW_PRESETS[toolId]
  const Icon = tool.icon
  const stats = variant === 'compact' ? preview.stats.slice(0, 2) : preview.stats
  const tracks = variant === 'compact' ? preview.tracks.slice(0, 2) : preview.tracks

  return (
    <div
      className={cn(
        'dash-tool-preview',
        variant === 'compact' ? 'dash-tool-preview--compact' : 'dash-tool-preview--hero',
        className,
      )}
      style={toolAccentStyle(tool.accent)}
    >
      <div className="dash-tool-preview-chrome">
        <div className="hero-mockup-dots">
          <span />
          <span />
          <span />
        </div>
        <div className="dash-tool-preview-window-label">
          <Icon size={14} />
          <span>{preview.windowLabel}</span>
        </div>
        <span className="dash-tool-preview-status">{preview.status}</span>
      </div>

      <div className="dash-tool-preview-body">
        <div className="dash-tool-preview-main">
          <div className="dash-tool-preview-copy">
            <p className="dash-tool-preview-title">{preview.title}</p>
            <p className="dash-tool-preview-subtitle">{preview.subtitle}</p>
          </div>

          <div className="dash-tool-preview-stats">
            {stats.map((stat) => (
              <div key={stat.label} className="dash-tool-preview-stat">
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
              </div>
            ))}
          </div>

          <div className="dash-tool-preview-tracks">
            {tracks.map((track) => (
              <div key={track.label} className={cn('dash-tool-preview-track', `is-${track.state}`)}>
                <span className="dash-tool-preview-track-indicator" aria-hidden="true" />
                <div className="dash-tool-preview-track-copy">
                  <strong>{track.label}</strong>
                  <span>{track.detail}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {variant === 'hero' ? (
          <aside className="dash-tool-preview-rail">
            <div className="dash-tool-preview-note-card">
              <div className="dash-tool-preview-note-title">
                <Sparkles size={14} />
                <span>{preview.noteTitle}</span>
              </div>
              <div className="dash-tool-preview-note-list">
                {preview.notes.map((note) => (
                  <div key={note} className="dash-tool-preview-note-item">
                    <CheckCircle2 size={13} />
                    <span>{note}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="dash-tool-preview-outcomes">
              {preview.outcomes.map((outcome) => (
                <span key={outcome} className="dash-tool-preview-outcome-chip">
                  {outcome}
                </span>
              ))}
            </div>
          </aside>
        ) : (
          <div className="dash-tool-preview-footer">{preview.outcomes[0]}</div>
        )}
      </div>
    </div>
  )
}
