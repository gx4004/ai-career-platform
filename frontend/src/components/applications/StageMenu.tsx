import { useState } from 'react'
import type { ReactNode } from 'react'
import { Undo2 } from 'lucide-react'
import {
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  ToneDot,
} from '#/components/kit'
import type { ApplicationStatus } from '#/lib/api/schemas'
import { STAGE_TONE, STATUSES, STATUS_LABELS, stageOf } from './stages'

const CLOSING: ApplicationStatus[] = ['rejected', 'withdrawn']

/**
 * "Move to…" menu. Any stage can move to any other, including back, except "No reply": it only
 * describes an application still waiting on the employer, so it is offered on Applied alone.
 * Each item carries its stage's colour dot, the colour of its board column.
 *
 * Moving an application that was marked applied back to Saved deletes the record of what was sent and the
 * applied date, so that one move asks first.
 */
export function StageMenu({
  status,
  onMove,
  sent = false,
  disabled,
  children,
}: {
  status: ApplicationStatus
  onMove: (status: ApplicationStatus) => void
  /** It was marked applied (it has a "What you sent" record): moving it back to Saved asks first. */
  sent?: boolean
  disabled?: boolean
  /** The trigger: a kit Button. */
  children: ReactNode
}) {
  const [confirming, setConfirming] = useState(false)
  const others = STATUSES.filter((option) => option !== status && (option !== 'no_reply' || status === 'applied'))
  const open = others.filter((option) => !CLOSING.includes(option))
  const closing = others.filter((option) => CLOSING.includes(option))
  const choose = (option: ApplicationStatus) => {
    if (option === 'saved' && sent) setConfirming(true)
    else onMove(option)
  }
  const dot = (option: ApplicationStatus) => <ToneDot tone={STAGE_TONE[stageOf(option)]} size="md" />
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={disabled}>
          {children}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Move to</DropdownMenuLabel>
          {open.map((option) => (
            <DropdownMenuItem key={option} icon={dot(option)} onSelect={() => choose(option)}>
              {STATUS_LABELS[option]}
            </DropdownMenuItem>
          ))}
          {closing.length ? <DropdownMenuSeparator /> : null}
          {closing.map((option) => (
            <DropdownMenuItem key={option} icon={dot(option)} onSelect={() => choose(option)}>
              {option === 'rejected' ? 'Close: not selected' : 'Close: I withdrew'}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        tone="destructive"
        icon={<Undo2 aria-hidden="true" />}
        title="Move it back to Saved?"
        description="This deletes the saved copy of what you sent and the date you applied. It can't be undone."
        confirmLabel="Move to Saved"
        onConfirm={() => {
          setConfirming(false)
          onMove('saved')
        }}
      />
    </>
  )
}
