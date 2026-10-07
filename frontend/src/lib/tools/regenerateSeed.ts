import { getApplication, listCvDocuments } from '#/lib/api/client'
import type { CvDocument, ToolRunDetail } from '#/lib/api/schemas'
import { readWorkflowContext, writeWorkflowContext } from '#/lib/tools/drafts'
import { getResumeCarryText } from '#/lib/tools/resumeCarryStore'
import { workflowConfigs } from '#/lib/tools/workflowConfigs'
import type { ToolId } from '#/lib/tools/registry'

/** A CV Studio document as plain resume text, the shape every tool's resume field takes. */
export function cvDocumentText(doc: Pick<CvDocument, 'header' | 'sections'>): string {
  const blocks: string[] = []
  const header = doc.header
  const contact = [header?.email, header?.phone, header?.location, ...(header?.links ?? [])].filter(Boolean)
  const top = [header?.name, header?.headline, contact.join(' · ')].filter(Boolean)
  if (top.length) blocks.push(top.join('\n'))
  for (const section of [...doc.sections].sort((a, b) => a.position - b.position)) {
    if (!section.visible || section.entries.length === 0) continue
    const lines = [section.title]
    for (const entry of [...section.entries].sort((a, b) => a.position - b.position)) {
      const dates = [entry.start_date, entry.end_date].filter(Boolean).join(' – ')
      const title = [entry.heading, entry.subheading].filter(Boolean).join(', ')
      const meta = [title, entry.location, dates].filter(Boolean).join(' · ')
      if (meta) lines.push(meta)
      lines.push(entry.body)
      for (const bullet of entry.bullets ?? []) if (bullet.trim()) lines.push(`- ${bullet.trim()}`)
    }
    blocks.push(lines.join('\n'))
  }
  return blocks.join('\n\n').trim()
}

const SEED_TIMEOUT_MS = 4000

function withTimeout<T>(promise: Promise<T>): Promise<T | null> {
  return Promise.race([
    promise.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), SEED_TIMEOUT_MS)),
  ])
}

/**
 * Re-generate from a result opened cold (a new tab, a shared link): runs do not keep their inputs, so
 * the tab has nothing to carry. Fill in what the account still has (the newest CV Studio CV for the
 * resume, the job description saved on the run's application) before the tool page opens. Never
 * throws and never waits more than a few seconds: a missing piece is simply asked for on the form.
 */
export async function seedRegenerate(item: ToolRunDetail, toolId: ToolId): Promise<void> {
  const fields = workflowConfigs[toolId].fields
  let context: ReturnType<typeof readWorkflowContext> = null
  let carried = ''
  try {
    context = readWorkflowContext()
    carried = getResumeCarryText()
  } catch {
    /* storage unavailable */
  }
  const needsResume = fields.some((field) => field.name === 'resumeText') && !context?.resumeText?.trim() && !carried.trim()
  const needsJob =
    fields.some((field) => field.name === 'jobDescription' && field.required) && !context?.jobDescription?.trim()

  const [cvs, application] = await Promise.all([
    needsResume ? withTimeout(listCvDocuments()) : Promise.resolve(null),
    needsJob && item.workspace?.id ? withTimeout(getApplication(item.workspace.id)) : Promise.resolve(null),
  ])

  // Sources are only named for what this Re-generate filled in; an earlier one's label must not linger.
  const update: Parameters<typeof writeWorkflowContext>[0] = {
    updatedAt: Date.now(), resumeSource: undefined, jobSource: undefined, jobLabel: regenerateJobLabel(item) ?? undefined,
  }
  const newest = cvs?.items.slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]
  const resumeText = newest ? cvDocumentText(newest) : ''
  if (newest && resumeText.length >= 50) {
    update.resumeText = resumeText
    update.resumeSource = `your CV Studio CV “${newest.name}”`
    update.resumeOrigin = 'cv-studio'
  }
  const listing = application?.listing
  if (listing?.description.trim()) {
    update.jobDescription = `${listing.title} at ${listing.company}\n\n${listing.description.trim()}`
    update.jobSource = 'the job description saved with its application'
    update.jobOrigin = 'application'
  }
  try {
    writeWorkflowContext(update)
  } catch {
    /* storage unavailable (blocked or full): the form asks for what is missing */
  }
}

/** "Senior Backend Engineer at Northwind Labs", from the run's application, when it has one. */
export function regenerateJobLabel(item: Pick<ToolRunDetail, 'workspace'>): string | null {
  const role = item.workspace?.role?.trim()
  const company = item.workspace?.company?.trim()
  if (role && company) return `${role} at ${company}`
  return role || company || null
}
