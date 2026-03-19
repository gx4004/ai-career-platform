import { FileSearch } from 'lucide-react'

export function DashboardResumeIllustration() {
  return (
    <div className="dashboard-illust-card">
      <div className="dashboard-illustration-large">
        {/* Pulsing ring behind the doc */}
        <div className="dashboard-illust-pulse-ring" />

        <div className="dashboard-illust-doc">
          {/* Faint resume text lines */}
          <div className="dashboard-illust-lines">
            <span style={{ width: '60%' }} />
            <span style={{ width: '80%' }} />
            <span style={{ width: '45%' }} />
            <span style={{ width: '70%' }} />
            <span style={{ width: '55%' }} />
          </div>
          <FileSearch size={36} className="dashboard-illust-doc-icon" />
          <div className="dashboard-illust-scan-beam" />
        </div>

        <div className="dashboard-illust-ring">
          <span className="dashboard-illust-badge dashboard-illust-badge--a">Skills</span>
          <span className="dashboard-illust-badge dashboard-illust-badge--b">Score</span>
          <span className="dashboard-illust-badge dashboard-illust-badge--c">Tips</span>
          <span className="dashboard-illust-badge dashboard-illust-badge--d">ATS</span>
        </div>
      </div>
    </div>
  )
}
