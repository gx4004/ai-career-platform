import { Highlight, Sticker } from '#/components/kit'
import { landingProofCopy } from '#/components/landing/landingContent'

/** The "Built for" band: who it is for, and the honest note about what this project is today. */
export function LandingSocialProof() {
  const { audience } = landingProofCopy
  return (
    <section className="lp-band" id="landing-proof" aria-label="Who it is for">
      <div className="lp-wrap lp-band__grid">
        <div>
          <h2 className="lp-band__title">{landingProofCopy.heading}</h2>
          <p className="lp-band__for">
            <Highlight>{audience.lead}</Highlight>
            {audience.middle}
            <Highlight>{audience.second}</Highlight>
            {audience.tail}
          </p>
        </div>
        <Sticker pin tilt={1.2} className="lp-note">
          <h3 className="lp-note__title">
            {landingProofCopy.noteTitle}
          </h3>
          <p>{landingProofCopy.noteBody}</p>
        </Sticker>
      </div>
    </section>
  )
}
