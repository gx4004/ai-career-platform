import { useQuery } from '@tanstack/react-query'
import {
  getAdminSubmissionQuality,
  type SubmissionFamilyQuality,
} from '#/lib/api/admin'

const percent = new Intl.NumberFormat('en', {
  style: 'percent',
  maximumFractionDigits: 1,
})

function Rate({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="admin-quality-rate">
      <span className="admin-quality-rate-label">{label}</span>
      <strong className="admin-quality-rate-value">
        {value === null ? 'Not enough evidence' : percent.format(value)}
      </strong>
    </div>
  )
}

function FamilyCard({ family }: { family: SubmissionFamilyQuality }) {
  return (
    <article className="admin-quality-family">
      <header className="admin-quality-family-header">
        <div>
          <span className="admin-quality-kicker">Source family</span>
          <h2>{family.source_family}</h2>
        </div>
        <span className="admin-quality-evidence">
          {family.evidence_base} {family.evidence_base === 1 ? 'confirmation' : 'confirmations'}
        </span>
      </header>
      <div className="admin-quality-rate-grid">
        <Rate label="Response rate" value={family.response_rate} />
        <Rate label="Packet edit rate" value={family.packet_edit_rate} />
        <Rate label="Duplicate prevention rate" value={family.duplicate_prevention_rate} />
        <Rate label="Complaint rate" value={family.complaint_rate} />
      </div>
    </article>
  )
}

export function AdminSubmissionQualityPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-submission-quality'],
    queryFn: () => getAdminSubmissionQuality(),
    staleTime: 30_000,
  })

  return (
    <div>
      <h1 className="admin-page-title">Submission Quality</h1>
      <p className="admin-table-muted admin-quality-intro">
        Quality and user outcomes govern this view—not submission volume. Rates are
        content-free aggregates by allowlisted source family. Confirmation counts are
        shown only as sample context and cannot activate, pause, or relax any control.
      </p>

      {isError && (
        <p className="admin-table-muted admin-error-text admin-quality-state" role="alert">
          Failed to load submission quality.
        </p>
      )}
      {isLoading && (
        <p className="admin-table-muted admin-quality-state" aria-live="polite">
          Loading submission quality…
        </p>
      )}
      {data && (
        <section className="admin-quality-grid" aria-label="Submission quality by source family">
          {data.families.map((family) => (
            <FamilyCard key={family.source_family} family={family} />
          ))}
        </section>
      )}
    </div>
  )
}
