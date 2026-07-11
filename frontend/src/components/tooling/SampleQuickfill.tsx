import { FlaskConical } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { isR7SampleQuickfillEnabled } from '#/lib/flags/featureFlags'

/**
 * R7 candidate #111 — "try a sample" quick-fill affordance (dark-shipped, default off).
 *
 * Renders a small, clearly-labeled button whose `onUse` handler seeds a field with
 * synthetic sample content. Callers wire `onUse` to the SAME callback the
 * dropzone/job-import components already use to write text into their editable
 * field (`DropzoneHero.onParsed` for the resume, `JobImportCard.onImported` for
 * the job description), so the seed lands on the existing paste-text field — no
 * new input mechanism, only seeded content.
 *
 * When `isR7SampleQuickfillEnabled()` is false (the default) this renders nothing,
 * so the dropzone/job-import inputs are byte-for-byte unchanged from today.
 */
export function SampleQuickfill({
  label,
  onUse,
}: {
  label: string
  onUse: () => void
}) {
  if (!isR7SampleQuickfillEnabled()) return null

  return (
    <div className="sample-quickfill" data-testid="sample-quickfill">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="sample-quickfill-btn"
        onClick={onUse}
      >
        <FlaskConical size={14} aria-hidden="true" />
        {label}
      </Button>
      <span className="sample-quickfill-note">Synthetic sample — not real data</span>
    </div>
  )
}
