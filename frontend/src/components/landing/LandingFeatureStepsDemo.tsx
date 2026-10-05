import { FitStamp, NumberDisc, ScoreBar, SkillPips, Sticker, ToolTile, type Tone } from '#/components/kit'
import { landingWorkflowCopy, landingWorkflowFeatures } from '#/components/landing/landingContent'
import { tools } from '#/lib/tools/registry'

const STEP_STYLE: ReadonlyArray<{ tone: Tone; tilt: number }> = [
  { tone: 'tangerine', tilt: -1.4 },
  { tone: 'mint', tilt: 1 },
  { tone: 'lilac', tilt: -0.8 },
]

/** The three small sample interfaces inside the step stickers. They are illustrations: sample data, hidden from assistive tech. */
function StepSample({ index }: { index: number }) {
  if (index === 0) {
    return (
      <div className="lp-step__ui" aria-hidden="true">
        <ScoreBar size="sm" tone="accent" label="Impact evidence" value={78} />
        <ScoreBar size="sm" tone="accent" label="Structure" value={82} />
      </div>
    )
  }
  if (index === 1) {
    return (
      <div className="lp-step__ui lp-step__ui--fit" aria-hidden="true">
        <FitStamp value={94} />
        <div>
          <b className="lp-step__job">Senior Backend Engineer, Platform</b>
          <span className="lp-step__skills">
            <span>8 of 8 skills</span>
            <SkillPips matched={8} total={8} />
          </span>
        </div>
      </div>
    )
  }
  const build = [tools['cover-letter'], tools.interview, tools.portfolio]
  return (
    <div className="lp-step__ui lp-step__ui--tools" aria-hidden="true">
      {build.map((tool) => (
        <span key={tool.id} className="lp-step__tool">
          <ToolTile size="sm" tone={tool.tone} icon={tool.icon} />
          {tool.label}
        </span>
      ))}
    </div>
  )
}

export function LandingFeatureStepsDemo() {
  return (
    <section className="lp-section" id="landing-journey" aria-labelledby="landing-journey-heading">
      <div className="lp-wrap">
        <div className="lp-section__head">
          <h2 className="lp-display lp-display--l" id="landing-journey-heading">
            {landingWorkflowCopy.title}
          </h2>
          <p className="lp-body-l">{landingWorkflowCopy.body}</p>
        </div>

        <ol className="lp-workflow-grid">
          {landingWorkflowFeatures.map((f, i) => (
            <Sticker
              as="li"
              key={f.step}
              size="xl"
              tone={STEP_STYLE[i].tone}
              tilt={STEP_STYLE[i].tilt}
              className="lp-workflow-card"
            >
              <NumberDisc n={i + 1} size="lg" />
              <h3 className="lp-workflow-title">{f.step}</h3>
              <p className="lp-workflow-lead">{f.title}</p>
              <p className="lp-workflow-body">{f.content}</p>
              <StepSample index={i} />
            </Sticker>
          ))}
        </ol>
      </div>
    </section>
  )
}
