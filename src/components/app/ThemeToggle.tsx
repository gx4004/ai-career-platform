import { Monitor, MoonStar, SunMedium } from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { useTheme } from '#/hooks/useTheme'

export function ThemeToggle() {
  const { mode, resolvedMode, setMode } = useTheme()
  const Icon = resolvedMode === 'dark' ? MoonStar : SunMedium

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="button-toolbar-utility gap-2">
          <Icon size={16} />
          <span className="hidden sm:inline capitalize">{mode}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={mode} onValueChange={(value) => setMode(value as typeof mode)}>
          <DropdownMenuRadioItem value="dark">
            <MoonStar size={14} />
            Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light">
            <SunMedium size={14} />
            Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor size={14} />
            System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setMode(resolvedMode === 'dark' ? 'light' : 'dark')}>
          Toggle quickly
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
