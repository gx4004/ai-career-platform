import { ArrowRight } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { Badge, Button, ScoreBar } from '#/components/kit'
import {
  landingExperimentHeroCopy,
  landingPrimaryCta,
} from '#/components/landing/landingContent'

// Neutral audience descriptors — no real brands/universities to avoid implied-endorsement
// or trademark issues. Swap in testimonials later once we have written permission.
const TRUST_ITEMS = [
  'CS graduates',
  'Bootcamp alumni',
  'Career switchers',
  'MBA candidates',
  'PhD researchers',
  'Product managers',
  'Design leads',
] as const

const PREVIEW_SCORES = [
  { label: 'Skills match', value: 85 },
  { label: 'Experience', value: 80 },
  { label: 'Education', value: 75 },
  { label: 'Keywords', value: 70 },
] as const

function ResumeAnalysisPreview() {
  return (
    <div className="lp-preview" aria-hidden="true">
      <div className="lp-preview-doc">
        <p className="lp-preview-name">Alex Johnson</p>
        <p className="lp-preview-role">Software Engineer</p>
        <p className="lp-preview-label">Experience</p>
        <p className="lp-preview-text">
          Project leading Cloud-native architectures using Kubernetes and Docker...
        </p>
        <p className="lp-preview-label">Education</p>
        <p className="lp-preview-text">
          MS in Computer Science, State University, Graduated 2018...
        </p>
        <p className="lp-preview-label">Skills</p>
        <p className="lp-preview-text">TypeScript, React, FastAPI</p>
      </div>
      <div className="lp-preview-report">
        <p className="lp-preview-score">
          <span className="lp-preview-score-num">84</span>
          <span className="lp-preview-score-of">Score / 100</span>
        </p>
        <div className="lp-preview-bars">
          {PREVIEW_SCORES.map((s) => (
            <ScoreBar
              key={s.label}
              label={s.label}
              value={s.value}
              valueLabel={`${s.value}%`}
              tone="accent"
              size="sm"
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export function LandingExperimentHero() {
  const copy = landingExperimentHeroCopy.strong
  const mobileHeadlineLines = copy.mobileHeadlineLines

  const handleSmoothScroll = (
    e: React.MouseEvent<HTMLAnchorElement>,
    targetId: string,
  ) => {
    e.preventDefault()
    const el = document.getElementById(targetId)
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    if (el) el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' })
  }

  return (
    <section className="lp-hero" id="landing-hero">
      <div className="lp-container lp-hero-grid">
        <div className="lp-hero-copy">
          <p className="lp-hero-eyebrow-row">
            <span className="lp-hero-eyebrow">{copy.eyebrow}</span>
            <Badge tone="accent" dot>Now in public beta</Badge>
          </p>
          <h1 className="lp-hero-h1">
            Your{' '}
            <span className="lp-hero-accent">resume</span>
            <br className="lp-hero-br--mobile" />
            {' '}has{' '}
            <span className="lp-hero-accent">{copy.headlineAccent}</span>
            .{' '}
            <span className="lp-hero-line lp-hero-line--desktop">{copy.headlinePost}</span>
            <span className="lp-hero-line lp-hero-line--mobile" aria-label={copy.headlinePost}>
              {mobileHeadlineLines.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </span>
          </h1>
          <p className="lp-hero-body lp-hero-body--desktop">{copy.body}</p>
          <p className="lp-hero-body lp-hero-body--mobile">{copy.mobileBody}</p>
          <div className="lp-hero-actions">
            <Button asChild size="lg">
              <Link to={landingPrimaryCta.to}>
                {copy.ctaLabel}
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <a
                href="#landing-journey"
                onClick={(e) => handleSmoothScroll(e, 'landing-journey')}
              >
                {copy.secondaryCtaLabel}
              </a>
            </Button>
          </div>
        </div>

        <Link
          to="/dashboard"
          className="lp-hero-image-wrap lp-hero-image-link"
          aria-label="Open Career Workbench dashboard"
        >
          <div className="lp-hero-image-card">
            <ResumeAnalysisPreview />
          </div>
        </Link>
      </div>

      <div className="lp-container">
        <div className="lp-hero-trust" role="group" aria-label="Built for job seekers across disciplines">
          <span className="lp-hero-trust-label">Built for</span>
          <ul className="lp-hero-trust-list">
            {TRUST_ITEMS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
