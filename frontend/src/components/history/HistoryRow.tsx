import { useEffect, useRef } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight, MoreHorizontal, Pencil, Star, Trash2 } from 'lucide-react'
import {
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
  RowMeta,
  RowReveal,
  RowSubtitle,
  RowTitle,
} from '#/components/kit'
import { formatRunDate } from '#/components/dashboard/RunRow'
import type { ToolRunSummary } from '#/lib/api/schemas'
import { historyRunHref, historyToolDisplay } from '#/lib/tools/historyToolLabel'
import { getNextStepToolId } from '#/lib/tools/runMetadata'
import { getToolByHistoryName, toolList } from '#/lib/tools/registry'

export function runLabel(item: ToolRunSummary) {
  return item.label || item.metadata.primary_recommendation_title || 'Untitled run'
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
 * hover and focus on a mouse, always on touch, and collapse into one menu on a phone.
 */
export function HistoryRow({
  item,
  rename,
  continuing,
  deleting,
  onStartRename,
  onToggleFavorite,
  onContinue,
  onDelete,
}: {
  item: ToolRunSummary
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
  const workspaceLabel = item.workspace?.label
  // "Job Match (75%)" already says which tool made it; saying "Match" under it again is noise.
  const namesTool = label.toLowerCase().includes(display.label.toLowerCase())
  const toolText = display.kind === 'cv-studio' ? 'Older CV Studio run' : namesTool ? null : display.label
  const favoriteLabel = item.is_favorite ? 'Remove from favorites' : 'Add to favorites'

  const renameButton = useRef<HTMLButtonElement | null>(null)
  const moreButton = useRef<HTMLButtonElement | null>(null)
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

  return (
    <Row className="history-row">
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
            <Button type="submit" size="sm" loading={rename.pending} disabled={!rename.draft.trim()}>
              Save
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={rename.onCancel}>
              Cancel
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
                {toolText}
                {workspaceLabel && workspaceLabel !== label ? (
                  <span className="history-row__clamp">{`Workspace: ${workspaceLabel}`}</span>
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
          {item.is_favorite ? <Star size={12} className="history-row__star" fill="currentColor" aria-hidden /> : null}
          <time dateTime={item.created_at}>{formatRunDate(item.created_at)}</time>
        </RowMeta>
      )}
      {rename ? null : (
        <RowActions
          reveal={false}
          collapse={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button ref={moreButton} iconOnly variant="ghost" size="sm" aria-label={`More actions for ${label}`}>
                  <MoreHorizontal aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              {/* The menu closes into the form or the dialog it opened: focus belongs to them. */}
              <DropdownMenuContent align="end" onCloseAutoFocus={(event) => event.preventDefault()}>
                {nextTool ? (
                  <DropdownMenuItem icon={<ArrowRight />} disabled={continuing} onSelect={onContinue}>
                    {continuing ? 'Opening…' : `Continue: ${nextTool.shortLabel}`}
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem icon={<Star fill={item.is_favorite ? 'currentColor' : 'none'} />} onSelect={onToggleFavorite}>
                  {favoriteLabel}
                </DropdownMenuItem>
                <DropdownMenuItem icon={<Pencil />} onSelect={onStartRename}>
                  Rename
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive icon={<Trash2 />} disabled={deleting} onSelect={() => onDelete(moreButton.current)}>
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          }
        >
          {nextTool ? (
            <Button variant="ghost" size="sm" disabled={continuing} onClick={onContinue}>
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
