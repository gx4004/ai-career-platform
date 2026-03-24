import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { AlertTriangle, Download, RefreshCw, Share2 } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { PageFrame } from '#/components/app/PageFrame'
import { resultDefinitions } from '#/lib/tools/resultDefinitions'
import { tools } from '#/lib/tools/registry'
import type { ToolId } from '#/lib/tools/registry'
import { toolAccentStyle } from '#/lib/tools/styleUtils'
import {
  resumeMockPayload,
  jobMatchMockPayload,
  careerMockPayload,
  interviewMockPayload,
  portfolioMockPayload,
  coverLetterMockPayload,
} from '#/lib/tools/mockPayloads'

const MOCK_PAYLOADS: Partial<Record<ToolId, Record<string, unknown>>> = {
  resume: resumeMockPayload,
  'job-match': jobMatchMockPayload,
  career: careerMockPayload,
  interview: interviewMockPayload,
  portfolio: portfolioMockPayload,
  'cover-letter': coverLetterMockPayload,
}

const MOCK_LABELS: Partial<Record<ToolId, string>> = {
  resume: 'adrian-nowak-resume.pdf',
  'job-match': 'Senior Full-Stack Engineer at Stripe',
  career: 'Adrian Nowak · Full-Stack Developer',
  interview: 'Senior Full-Stack Engineer at Stripe',
  portfolio: 'Adrian Nowak · Target: Senior Full-Stack Engineer',
  'cover-letter': 'Senior Full-Stack Engineer at Stripe',
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function ResultLoadingSkeleton() {
  return (
    <section className="result-screen content-max" aria-busy="true" aria-label="Loading result">
      {/* Hero card skeleton */}
      <div className="result-hero-card" style={{ padding: '1.4rem' }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-3" style={{ flex: 1 }}>
            <div className="flex gap-2">
              <div className="skeleton" style={{ height: '1.5rem', width: '7rem', borderRadius: '999px' }} />
              <div className="skeleton" style={{ height: '1.5rem', width: '5rem', borderRadius: '999px' }} />
            </div>
            <div className="grid gap-2">
              <div className="skeleton skeleton-text" style={{ width: '55%', height: '1.75rem' }} />
              <div className="skeleton skeleton-text" style={{ width: '40%' }} />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="skeleton" style={{ height: '2rem', width: '6rem', borderRadius: 'var(--radius-md)' }} />
            <div className="skeleton" style={{ height: '2rem', width: '5rem', borderRadius: 'var(--radius-md)' }} />
          </div>
        </div>
      </div>

      {/* Summary card skeleton */}
      <div className="section-card" style={{ padding: '1.4rem' }}>
        <div className="grid gap-2">
          <div className="skeleton skeleton-text" style={{ width: '12rem' }} />
          <div className="skeleton skeleton-text" style={{ width: '80%' }} />
          <div className="skeleton skeleton-text" style={{ width: '65%' }} />
        </div>
      </div>

      {/* Hero metric skeleton */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.5fr) minmax(18rem, 0.9fr)',
          gap: '1rem',
        }}
      >
        <div className="result-section" style={{ minHeight: '12rem' }}>
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
            <div className="skeleton skeleton-avatar" style={{ width: '9rem', height: '9rem', borderRadius: '9999px', flexShrink: 0 }} />
            <div className="grid gap-3" style={{ flex: 1 }}>
              <div className="skeleton skeleton-text" style={{ width: '60%', height: '1.5rem' }} />
              <div className="skeleton skeleton-text" style={{ width: '80%' }} />
              <div className="skeleton skeleton-text" style={{ width: '70%' }} />
            </div>
          </div>
        </div>
        <div className="result-section" style={{ minHeight: '12rem' }}>
          <div className="grid gap-3">
            <div className="skeleton skeleton-text" style={{ width: '8rem' }} />
            <div className="skeleton skeleton-text" style={{ width: '75%', height: '1.5rem' }} />
            <div className="skeleton skeleton-text" style={{ width: '85%' }} />
            <div className="skeleton skeleton-text" style={{ width: '60%' }} />
          </div>
        </div>
      </div>

      {/* Cards grid skeleton */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(15rem, 1fr))',
          gap: '1rem',
        }}
      >
        {[1, 2, 3].map((i) => (
          <div key={i} className="metric-card" style={{ padding: '1.25rem', minHeight: '8rem' }}>
            <div className="grid gap-3">
              <div className="skeleton skeleton-text" style={{ width: '50%' }} />
              <div className="skeleton skeleton-text" style={{ width: '2.5rem', height: '2rem' }} />
              <div className="skeleton skeleton-text" style={{ width: '85%' }} />
            </div>
          </div>
        ))}
      </div>

      {/* Chip rows skeleton */}
      <div className="result-section">
        <div className="skeleton skeleton-text" style={{ width: '10rem', marginBottom: '1rem' }} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {[80, 65, 90, 72, 55, 88, 70, 60].map((w, i) => (
            <div
              key={i}
              className="skeleton"
              style={{ height: '1.75rem', width: `${w}px`, borderRadius: '999px' }}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Error state ───────────────────────────────────────────────────────────────

function ResultErrorState({ toolId, onRetry }: { toolId: ToolId; onRetry: () => void }) {
  const tool = tools[toolId]
  return (
    <PageFrame>
      <section className="result-screen content-max">
        <div
          className="result-hero-card"
          style={{ ...toolAccentStyle(tool.accent), padding: '2.5rem 1.4rem', textAlign: 'center' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem' }}>
            <div
              style={{
                width: '3rem',
                height: '3rem',
                borderRadius: '9999px',
                background: 'var(--destructive-soft)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AlertTriangle size={20} style={{ color: 'var(--destructive)' }} />
            </div>
            <div className="grid gap-2">
              <Badge variant="outline">{tool.label}</Badge>
              <h1 className="page-title">Result could not be loaded</h1>
              <p className="muted-copy" style={{ maxWidth: '32rem', margin: '0 auto' }}>
                The result payload is unavailable. This can happen if the run expired, the backend
                is offline, or the session was cleared. Run the tool again to generate a fresh
                result.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <Button variant="outline" onClick={onRetry}>
                <RefreshCw size={15} />
                Try again
              </Button>
              <Button className="button-hero-primary" asChild>
                <Link to={tool.route}>Run {tool.shortLabel} →</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </PageFrame>
  )
}

// ── Preview shell ─────────────────────────────────────────────────────────────

type PreviewState = 'loading' | 'results' | 'error'

export function ToolResultPreview({ toolId }: { toolId: ToolId }) {
  const [state, setState] = useState<PreviewState>('loading')
  const tool = tools[toolId]
  const payload = MOCK_PAYLOADS[toolId]
  const definition = resultDefinitions[toolId]
  const label = MOCK_LABELS[toolId] ?? 'Demo run'
  const summary =
    payload?.summary && typeof payload.summary === 'object'
      ? (payload.summary as Record<string, unknown>)
      : {}

  // Simulate a 1.8-second processing delay then show results
  useEffect(() => {
    const timer = window.setTimeout(() => setState('results'), 1800)
    return () => window.clearTimeout(timer)
  }, [])

  if (state === 'loading') {
    return (
      <PageFrame>
        <ResultLoadingSkeleton />
      </PageFrame>
    )
  }

  if (state === 'error') {
    return <ResultErrorState toolId={toolId} onRetry={() => setState('loading')} />
  }

  if (!payload || !definition) {
    return (
      <ResultErrorState
        toolId={toolId}
        onRetry={() => {
          setState('loading')
          window.setTimeout(() => setState('results'), 1800)
        }}
      />
    )
  }

  return (
    <PageFrame>
      <section className="result-screen content-max">
        {/* Hero header */}
        <div className="result-hero result-hero-card" style={toolAccentStyle(tool.accent)}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="grid gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="outline">{tool.label}</Badge>
                <Badge
                  variant="outline"
                  style={{ borderColor: tool.accent, color: tool.accent }}
                >
                  Preview
                </Badge>
              </div>
              <div className="grid gap-1">
                <h1 className="page-title">{tool.resultTitle}</h1>
                <p className="muted-copy">
                  {label} · {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
            </div>
            <div className="result-header-actions button-cluster button-cluster--toolbar">
              <Button variant="outline" asChild className="button-toolbar-utility">
                <Link to={tool.route}>Run again →</Link>
              </Button>
              <Button
                variant="outline"
                className="button-toolbar-utility"
                title="Download (demo placeholder)"
              >
                <Download size={16} />
                Download
              </Button>
              <Button
                variant="outline"
                className="button-toolbar-utility"
                title="Share (demo placeholder)"
              >
                <Share2 size={16} />
                Share
              </Button>
              <Button
                variant="outline"
                className="button-toolbar-utility"
                onClick={() => setState('error')}
                title="Show error state"
              >
                Error state
              </Button>
            </div>
          </div>
        </div>

        {/* Summary card */}
        <div className="section-card grid gap-2 p-5">
          <p className="eyebrow">Why this result was generated</p>
          <p>{typeof summary.headline === 'string' ? summary.headline : tool.summary}</p>
          <p className="small-copy muted-copy">
            {typeof summary.confidence_note === 'string'
              ? summary.confidence_note
              : 'This output is heuristic and advisory, not a hiring prediction.'}
          </p>
        </div>

        {/* Main result body — reuses existing render functions */}
        <div className="result-body">
          {definition.render(payload, {
            id: 'preview',
            tool_name: toolId,
            label,
            is_favorite: false,
            created_at: new Date().toISOString(),
            saved: false,
            access_mode: 'guest_demo',
            locked_actions: [],
            metadata: {
              summary_headline: null,
              primary_recommendation_title: null,
              schema_version: null,
              linked_context_ids: [],
              next_step_tool: null,
            },
            result_payload: payload,
          }, tool)}
        </div>

        {/* Next-action CTA cards */}
        <div className="cta-card-grid">
          {tool.nextActions.map((action) => {
            const nextTool = tools[action.to]
            return (
              <div key={action.label} className="cta-card p-5">
                <div className="grid gap-3">
                  <div className="flex items-center gap-3">
                    <nextTool.icon size={18} style={{ color: nextTool.accent }} />
                    <h3 className="section-title">{action.label}</h3>
                  </div>
                  <p className="small-copy muted-copy">{nextTool.summary}</p>
                  <Button className="button-hero-primary" asChild>
                    <Link to={nextTool.route}>Open {nextTool.shortLabel} →</Link>
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </PageFrame>
  )
}
