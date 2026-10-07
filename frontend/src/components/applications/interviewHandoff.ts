import type { ApplicationDetail } from '#/lib/api/schemas'
import { writeWorkflowContext } from '#/lib/tools/drafts'
import { applicationTitle, roleOnly } from './stages'

/**
 * "Prepare for interviews" from an application carries it into Interview Q&A the way the dashboard's "Prep for the
 * round" does (the tab's workflow context): its role, the saved job description when it has one, and the application
 * itself, so the run is filed under it. The link still opens the tool when storage is unavailable.
 */
export function carryApplicationToInterview(application: ApplicationDetail) {
  const listing = application.listing
  const description = listing?.description?.trim()
  try {
    // The context merges, so every job field is written for this application: an earlier job's description, label,
    // source or run must not ride along when this application has no saved description.
    writeWorkflowContext({
      targetRole: application.role?.trim() || roleOnly(applicationTitle(application), application.company),
      jobDescription: listing && description ? `${listing.title} at ${listing.company}\n\n${description}` : undefined,
      jobLabel: undefined,
      jobSource: undefined,
      jobOrigin: listing && description ? 'application' : undefined,
      roleOrigin: 'application',
      historyId: undefined,
      jobMatch: undefined,
      workspaceId: application.id,
      workspaceLabel: application.label ?? applicationTitle(application),
      updatedAt: Date.now(),
    })
  } catch {
    /* storage unavailable: the form asks for what is missing */
  }
}
