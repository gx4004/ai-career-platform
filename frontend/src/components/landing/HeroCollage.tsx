import { Check, FileText } from 'lucide-react'
import { Badge, ScoreBar, ScoreSeal, Sticker } from '#/components/kit'
import { landingExampleResult, landingExampleScore } from '#/components/landing/landingContent'

/**
 * The hero collage: a real Resume Analyzer report, composed from kit parts and labelled "Example result".
 * Every number is sample data (landingExampleResult); the seal is the rounded mean of the four bars.
 * The pieces sit in flow inside a container-query box, so they keep their proportions from 1440 down to
 * about 520px and never overlap; below that the collage becomes a plain stack (landing.css).
 */
export function HeroCollage() {
  const example = landingExampleResult
  return (
    <div className="lp-hero-image-card lp-collage" aria-hidden="true">
      <div className="lp-collage__stage" data-cookie-keep-clear="">
        <Sticker as="span" size="sm" tilt={-3} className="lp-collage__tab">
          Example result
        </Sticker>

        <Sticker className="lp-preview lp-collage__card" tilt={1}>
          <p className="lp-collage__file">
            <FileText aria-hidden="true" />
            {example.file}
          </p>
          <div className="lp-collage__body">
            <ScoreSeal value={landingExampleScore} label="Example score" size="sm" />
            <div className="lp-collage__bars">
              {example.scores.map((score) => (
                <ScoreBar
                  key={score.label}
                  size="sm"
                  tone="success"
                  label={score.label}
                  value={score.value}
                  valueLabel={`${score.value}%`}
                />
              ))}
            </div>
          </div>
        </Sticker>

        <div className="lp-collage__stickers">
          <Sticker tone="lemon" tilt={-2} className="lp-collage__fix">
            <Badge tone="white">Fix first</Badge>
            <h3 className="lp-collage__title">{example.fix.title}</h3>
            <p className="lp-collage__text">{example.fix.body}</p>
          </Sticker>

          <Sticker tilt={2} className="lp-collage__match">
            <h3 className="lp-collage__title lp-collage__title--ui">Job Match</h3>
            <ScoreBar size="sm" tone="success" label="Fit" value={example.jobFit} valueLabel={`${example.jobFit}%`} />
          </Sticker>

          <Sticker tone="mint" tilt={1.2} className="lp-collage__strength">
            <span className="lp-collage__check">
              <Check aria-hidden="true" />
            </span>
            <div>
              <b>Strength</b>
              <p className="lp-collage__text lp-collage__text--strong">{example.strength}</p>
            </div>
          </Sticker>
        </div>
      </div>
    </div>
  )
}
