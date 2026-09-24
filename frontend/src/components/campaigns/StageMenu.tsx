import type { ReactNode } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import type { CampaignStatus } from '#/lib/api/schemas'
import { STATUS_LABELS, nextStatuses } from './stages'

/** "Move to…" menu listing only the stages this application can still reach. */
export function StageMenu({
  status,
  onMove,
  disabled,
  children,
}: {
  status: CampaignStatus | null
  onMove: (status: CampaignStatus) => void
  disabled?: boolean
  children: ReactNode
}) {
  const options = nextStatuses(status)
  const open = options.filter((option) => option !== 'rejected' && option !== 'withdrawn')
  const closing = options.filter((option) => option === 'rejected' || option === 'withdrawn')
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled || options.length === 0}>
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
