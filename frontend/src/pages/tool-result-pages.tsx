import { getRouteApi } from '@tanstack/react-router'
import { ToolResultScreen } from '#/components/tooling/ToolResultScreen'
import { ToolResultPreview } from '#/components/tooling/ToolResultPreview'

const resumeResultRoute = getRouteApi('/resume_/result/$historyId')
const jobMatchResultRoute = getRouteApi('/job-match_/result/$historyId')
const coverLetterResultRoute = getRouteApi('/cover-letter_/result/$historyId')
const interviewResultRoute = getRouteApi('/interview_/result/$historyId')
const careerResultRoute = getRouteApi('/career_/result/$historyId')
const portfolioResultRoute = getRouteApi('/portfolio_/result/$historyId')

export function ResumeResultPage() {
  const { historyId } = resumeResultRoute.useParams()
  return <ToolResultScreen toolId="resume" historyId={historyId} />
}

export function JobMatchResultPage() {
  const { historyId } = jobMatchResultRoute.useParams()
  return <ToolResultScreen toolId="job-match" historyId={historyId} />
}

export function CoverLetterResultPage() {
  const { historyId } = coverLetterResultRoute.useParams()
  return <ToolResultScreen toolId="cover-letter" historyId={historyId} />
}

export function InterviewResultPage() {
  const { historyId } = interviewResultRoute.useParams()
  return <ToolResultScreen toolId="interview" historyId={historyId} />
}

export function CareerResultPage() {
  const { historyId } = careerResultRoute.useParams()
  return <ToolResultScreen toolId="career" historyId={historyId} />
}

export function PortfolioResultPage() {
  const { historyId } = portfolioResultRoute.useParams()
  return <ToolResultScreen toolId="portfolio" historyId={historyId} />
}

// ── Preview pages (static mock data, no backend required) ─────────────────────

export function ResumePreviewPage() {
  return <ToolResultPreview toolId="resume" />
}

export function JobMatchPreviewPage() {
  return <ToolResultPreview toolId="job-match" />
}

export function CareerPreviewPage() {
  return <ToolResultPreview toolId="career" />
}

export function InterviewPreviewPage() {
  return <ToolResultPreview toolId="interview" />
}

export function PortfolioPreviewPage() {
  return <ToolResultPreview toolId="portfolio" />
}

export function CoverLetterPreviewPage() {
  return <ToolResultPreview toolId="cover-letter" />
}
