import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight, MoreHorizontal, Pencil, Star, Trash2 } from 'lucide-react'
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Field,
  Input,
  MetaRow,
  Row,
  RowActions,
  RowBody,
  RowLeading,
  RowMeta,
  RowReveal,
  RowSubtitle,
  RowTitle,
  ToolTile,
} from '#/components/kit'
import type { ToolRunSummary } from '#/lib/api/schemas'
import { historyRunHref, historyToolDisplay } from '#/lib/tools/historyToolLabel'
import { getNextStepToolId } from '#/lib/tools/runMetadata'
import { getToolByHistoryName, toolList } from '#/lib/tools/registry'

export function runLabel(item: ToolRunSummary) {
  return item.label || item.metadata.primary_recommendation_title || 'Untitled run'
}

/** The row sits under its day heading, so it only needs the time of day. */
function formatRunTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

type Rename = {
  draft: string
  error: string | null
  pending: boolean
  onDraftChange: (draft: string) => void
  onSubmit: () => void
  onCancel: () => void
}

/**
 * One saved run: the label opens it (the whole row is the link), the tool and the sentence it
 * produced sit underneath, the date is at the end. Star, rename, delete and "continue" appear on
 * hover and focus on a mouse, always on touch, and collapse into one menu on a phone. On a tablet-width
 * list "continue" stays in the row and only star, rename and delete go into the menu (history.css).
 */
export function HistoryRow({
  item,
  parentLabel,
  rename,
  continuing,
  deleting,
  onStartRename,
  onToggleFavorite,
  onContinue,
  onDelete,
}: {
  item: ToolRunSummary
  /** The label of the run this one re-generates, when that run is on the same page. */
  parentLabel?: string | null
  /** Set while this row is being renamed. */
  rename: Rename | null
  continuing: boolean
  deleting: boolean
  onStartRename: () => void
  onToggleFavorite: () => void
  onContinue: () => void
  /** `trigger` is where focus should return if the delete is cancelled. */
  onDelete: (trigger: HTMLElement | null) => void
}) {
  const display = historyToolDisplay(item.tool_name)
  const href = historyRunHref(item)
  const label = runLabel(item)
  const registryTool = display.kind === 'tool' ? getToolByHistoryName(item.tool_name) : null
  const nextTool = registryTool
    ? toolList.find((candidate) => candidate.id === getNextStepToolId(registryTool.id, item.metadata))
    : null
  // Every run has a workspace behind it; only one that targets a job (an application) is worth naming.
  const workspace = item.workspace
  const applicationLabel =
    workspace && (workspace.status || workspace.listing)
      ? workspace.label || [workspace.role, workspace.company].filter(Boolean).join(' at ') || null
      : null
  // "Job Match (75%)" already says which tool made it; saying "Match" under it again is noise.
  const namesTool = label.toLowerCase().includes(display.label.toLowerCase())
  // The tool's full name, as the filter on the same page says it: "Match" alone did not say which tool it was.
  const toolText = display.kind === 'cv-studio' ? 'Older CV Studio run' : namesTool ? null : (registryTool?.label ?? display.label)
  // "Star", the one word for it app-wide (consistency-F11), with the run it acts on, as Rename and Delete name theirs.
  // One name in both states: the toggle's aria-pressed says whether it is starred (consistency-F28), as on the result.
  const favoriteLabel = `Star ${label}`

  const renameButton = useRef<HTMLButtonElement | null>(null)
  const moreButton = useRef<HTMLButtonElement | null>(null)
  const continueButton = useRef<HTMLButtonElement | null>(null)
  // The menu repeats "Continue" only where the row does not show it (a phone list); read when the menu opens.
  const [continueInMenu, setContinueInMenu] = useState(true)
  const menuHandsFocusOn = useRef(false)
  const renaming = rename !== null
  const wasRenaming = useRef(false)
  useEffect(() => {
    // Put focus back where it was when the form closes: the inline button, or the menu on a phone.
    if (wasRenaming.current && !renaming) {
      const visible = [renameButton.current, moreButton.current].find((node) => node && node.offsetParent !== null)
      visible?.focus()
    }
    wasRenaming.current = renaming
  }, [renaming])

  const isRevision = Boolean(item.parent_run_id)

  return (
    <Row className="history-row" data-run-id={item.id}>
      <RowLeading>
        <ToolTile size="md" tone={registryTool?.tone ?? 'stone'} icon={display.icon} />
      </RowLeading>
      <RowBody>
        {rename ? (
          <form
            className="history-rename"
            onSubmit={(event) => {
              event.preventDefault()
              // A run can be renamed but never left without a name.
              if (!rename.draft.trim()) return
              rename.onSubmit()
            }}
          >
            <Field label={`Rename ${label}`} hideLabel error={rename.error}>
              <Input
                autoFocus
                size="sm"
                value={rename.draft}
                maxLength={200}
                onChange={(event) => rename.onDraftChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    rename.onCancel()
                  }
                }}
              />
            </Field>
            {/* Cancel (ghost) first, then the save action: the order of every dialog footer and inline confirm
                (consistency-F22). Save stays filled: while renaming it is this list's one primary. */}
            <Button type="button" size="sm" variant="ghost" onClick={rename.onCancel}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={rename.pending} disabled={!rename.draft.trim()}>
              Save
            </Button>
          </form>
        ) : (
          <>
            {href ? (
              <RowTitle asChild>
                <Link to={href}>{label}</Link>
              </RowTitle>
            ) : (
              <RowTitle>{label}</RowTitle>
            )}
            <RowSubtitle>
              <MetaRow>
                {isRevision ? (
                  <Badge tone="lilac" size="sm">
                    Revision
                    {parentLabel ? <span className="kit-sr-only"> of {parentLabel}</span> : null}
                  </Badge>
                ) : null}
                {toolText}
                {applicationLabel && applicationLabel !== label ? (
                  <span className="history-row__clamp">{`Application: ${applicationLabel}`}</span>
                ) : null}
                {item.metadata.summary_headline ? (
                  <span className="history-row__clamp">{item.metadata.summary_headline}</span>
                ) : null}
              </MetaRow>
            </RowSubtitle>
          </>
        )}
      </RowBody>
      {rename ? null : (
        <RowMeta>
          {item.is_favorite ? <Star size={14} className="history-row__star" fill="currentColor" aria-hidden /> : null}
          <time dateTime={item.created_at}>{formatRunTime(item.created_at)}</time>
        </RowMeta>
      )}
      {rename ? null : (
        <RowActions
          reveal={false}
          collapse={
            <DropdownMenu
              onOpenChange={(open) => {
                if (open) setContinueInMenu(!continueButton.current || continueButton.current.offsetParent === null)
              }}
            >
              <DropdownMenuTrigger asChild>
                <Button ref={moreButton} iconOnly variant="ghost" size="sm" aria-label={`More actions for ${label}`}>
                  <MoreHorizontal aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              {/* Rename and Delete close the menu into a form or a dialog that takes focus; Esc and the other items return it to the trigger. */}
              <DropdownMenuContent
                align="end"
                onCloseAutoFocus={(event) => {
                  if (menuHandsFocusOn.current) event.preventDefault()
                  menuHandsFocusOn.current = false
                }}
              >
                {nextTool && continueInMenu ? (
                  <DropdownMenuItem icon={<ArrowRight />} disabled={continuing} onSelect={onContinue}>
                    {continuing ? 'Opening…' : `Continue: ${nextTool.shortLabel}`}
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem icon={<Star fill={item.is_favorite ? 'currentColor' : 'none'} />} onSelect={onToggleFavorite}>
                  {/* The menu belongs to this run already ("More actions for …"): the item is just the verb. */}
                  {item.is_favorite ? 'Remove star' : 'Star'}
                </DropdownMenuItem>
                <DropdownMenuItem
                  icon={<Pencil />}
                  onSelect={() => {
                    menuHandsFocusOn.current = true
                    onStartRename()
                  }}
                >
                  Rename
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  destructive
                  icon={<Trash2 />}
                  disabled={deleting}
                  onSelect={() => {
                    menuHandsFocusOn.current = true
                    onDelete(moreButton.current)
                  }}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          }
        >
          {nextTool ? (
            <Button ref={continueButton} className="history-row__continue" variant="ghost" size="sm" disabled={continuing} onClick={onContinue}>
              {continuing ? 'Opening…' : `Continue: ${nextTool.shortLabel}`}
            </Button>
          ) : null}
          <RowReveal>
            <Button
              iconOnly
              variant="ghost"
              size="sm"
              aria-label={favoriteLabel}
              aria-pressed={item.is_favorite}
              onClick={onToggleFavorite}
            >
              <Star fill={item.is_favorite ? 'currentColor' : 'none'} aria-hidden />
            </Button>
            <Button ref={renameButton} iconOnly variant="ghost" size="sm" aria-label={`Rename ${label}`} onClick={onStartRename}>
              <Pencil aria-hidden />
            </Button>
            <Button
              iconOnly
              variant="ghost"
              size="sm"
              aria-label={`Delete ${label}`}
              disabled={deleting}
              onClick={(event) => onDelete(event.currentTarget)}
            >
              <Trash2 aria-hidden />
            </Button>
          </RowReveal>
        </RowActions>
      )}
    </Row>
  )
}
