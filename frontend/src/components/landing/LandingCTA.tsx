import { Upload } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { Button, ScoreSeal, Sticker } from '#/components/kit'
import {
  landingCtaCopy,
  landingExampleScore,
  landingPrimaryCta,
} from '#/components/landing/landingContent'

export function LandingCTA() {
  return (
    <section className="lp-section lp-section--closer" id="landing-cta">
      <div className="lp-wrap">
        <Sticker as="div" size="xl" className="lp-cta-card">
          <div>
            <h2 className="lp-display lp-display--l lp-cta-h2">{landingCtaCopy.title}</h2>
            <div className="lp-cta-action">
              <Button asChild size="lg">
                <Link to={landingPrimaryCta.to}>
                  <Upload aria-hidden="true" />
                  {landingCtaCopy.ctaLabel}
                </Link>
              </Button>
              <p className="lp-cta-micro">{landingCtaCopy.trustLine}</p>
            </div>
          </div>

          <div className="lp-cta-art" aria-hidden="true">
            <ScoreSeal value={landingExampleScore} label="Example score" tone="lemon" size="md" className="lp-cta-seal" />
            <Sticker as="span" size="sm" tone="mint" tilt={-3} className="lp-cta-tag lp-cta-tag--good">
              Strong foundation
            </Sticker>
            <Sticker as="span" size="sm" tilt={3} className="lp-cta-tag lp-cta-tag--issues">
              2 issues to fix
            </Sticker>
          </div>
        </Sticker>
      </div>
    </section>
  )
}
