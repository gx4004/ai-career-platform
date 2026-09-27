import type { ReactNode } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import type { ApplicationStatus } from '#/lib/api/schemas'
import { STATUSES, STATUS_LABELS } from './stages'

const CLOSING: ApplicationStatus[] = ['rejected', 'withdrawn']

/** "Move to…" menu. Any stage can move to any other, including back. */
export function StageMenu({
  status,
  onMove,
  disabled,
  children,
}: {
  status: ApplicationStatus
  onMove: (status: ApplicationStatus) => void
  disabled?: boolean
  children: ReactNode
}) {
  const others = STATUSES.filter((option) => option !== status)
  const open = others.filter((option) => !CLOSING.includes(option))
  const closing = others.filter((option) => CLOSING.includes(option))
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Move to</DropdownMenuLabel>
        {open.map((option) => (
          <DropdownMenuItem key={option} onSelect={() => onMove(option)}>
            {STATUS_LABELS[option]}
          </DropdownMenuItem>
        ))}
        {closing.length ? <DropdownMenuSeparator /> : null}
        {closing.map((option) => (
          <DropdownMenuItem key={option} onSelect={() => onMove(option)}>
            {option === 'rejected' ? 'Close: not selected' : 'Close: I withdrew'}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
