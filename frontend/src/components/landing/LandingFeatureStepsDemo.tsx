import {
  landingWorkflowCopy,
  landingWorkflowFeatures,
} from '#/components/landing/landingContent'

export function LandingFeatureStepsDemo(_: { autoPlay?: boolean } = {}) {
  return (
    <section className="lp-section" id="landing-journey">
      <div className="lp-container">
        <h2 className="lp-section-h2">{landingWorkflowCopy.title}</h2>
        <p className="lp-section-sub">
          A systematic approach to career growth, powered by AI precision.
        </p>

        <ol className="lp-workflow-grid">
          {landingWorkflowFeatures.map((f, i) => (
            <li key={f.step} className="lp-workflow-card">
              <span className="lp-workflow-num">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="lp-workflow-title">{f.step}</h3>
              <p className="lp-workflow-lead">{f.title}</p>
              <p className="lp-workflow-body">{f.content}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
