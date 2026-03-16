import type { CSSProperties } from 'react'
import type { ToolId } from '#/lib/tools/registry'
import {
  FileSearch,
  Target,
  FileText,
  MessageSquare,
  TrendingUp,
  Briefcase,
} from 'lucide-react'

const illustrations: Record<ToolId, () => React.ReactNode> = {
  resume: () => (
    <div className="tool-illust tool-illust--resume">
      <div className="tool-illust-doc">
        <FileSearch size={32} />
        <div className="tool-illust-scan-beam" />
      </div>
      <div className="tool-illust-badges">
        <span className="tool-illust-badge">Skills</span>
        <span className="tool-illust-badge">Score</span>
        <span className="tool-illust-badge">Tips</span>
      </div>
    </div>
  ),
  'job-match': () => (
    <div className="tool-illust tool-illust--match">
      <div className="tool-illust-venn">
        <div className="tool-illust-circle tool-illust-circle--left" />
        <div className="tool-illust-circle tool-illust-circle--right" />
        <Target size={24} className="tool-illust-venn-icon" />
      </div>
    </div>
  ),
  'cover-letter': () => (
    <div className="tool-illust tool-illust--letter">
      <div className="tool-illust-letter-doc">
        <FileText size={28} />
        <div className="tool-illust-cursor" />
      </div>
    </div>
  ),
  interview: () => (
    <div className="tool-illust tool-illust--interview">
      <div className="tool-illust-cards">
        <div className="tool-illust-card tool-illust-card--back" />
        <div className="tool-illust-card tool-illust-card--front">
          <MessageSquare size={24} />
        </div>
      </div>
    </div>
  ),
  career: () => (
    <div className="tool-illust tool-illust--career">
      <div className="tool-illust-paths">
        <TrendingUp size={28} />
        <div className="tool-illust-branch tool-illust-branch--a" />
        <div className="tool-illust-branch tool-illust-branch--b" />
        <div className="tool-illust-branch tool-illust-branch--c" />
      </div>
    </div>
  ),
  portfolio: () => (
    <div className="tool-illust tool-illust--portfolio">
      <div className="tool-illust-tiles">
        <Briefcase size={26} />
        <div className="tool-illust-tile tool-illust-tile--a" />
        <div className="tool-illust-tile tool-illust-tile--b" />
        <div className="tool-illust-tile tool-illust-tile--c" />
      </div>
    </div>
  ),
}

export function ToolHeroIllustration({
  toolId,
  accent,
  loading = false,
}: {
  toolId: ToolId
  accent?: string
  loading?: boolean
}) {
  const Illustration = illustrations[toolId]
  if (!Illustration) return null

  return (
    <div
      className={`tool-illust-wrap ${loading ? 'tool-illust-wrap--loading' : ''}`}
      style={{ '--tool-accent': accent } as CSSProperties}
    >
      <Illustration />
    </div>
  )
}
