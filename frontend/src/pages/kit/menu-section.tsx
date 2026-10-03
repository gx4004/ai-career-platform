import { useState } from 'react'
import {
  ArrowUpRight,
  ChevronsUpDown,
  Copy,
  EyeOff,
  FileText,
  LogOut,
  MoreHorizontal,
  Pencil,
  Search,
  Settings2,
  Trash2,
  UserRound,
} from 'lucide-react'
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Kbd,
} from '#/components/kit'
import { GallerySection, Group, Row, Specimen, Stage } from './gallery-parts'

const STAGES = ['Saved', 'Applied', 'Interviewing', 'Offer']

function MoveToMenu() {
  const [stage, setStage] = useState('Applied')
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary">
          {stage}
          <ChevronsUpDown aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="kit-gallery__menu-w">
        <DropdownMenuLabel>Move to</DropdownMenuLabel>
        {STAGES.filter((option) => option !== stage).map((option) => (
          <DropdownMenuItem key={option} onSelect={() => setStage(option)}>
            {option}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setStage('Rejected')}>Close: not selected</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setStage('Withdrawn')}>Close: I withdrew</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function RowActionsMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button iconOnly variant="ghost" aria-label="More actions for Senior Backend Engineer">
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="kit-gallery__menu-w">
        <DropdownMenuItem icon={<Search />}>Deep match</DropdownMenuItem>
        <DropdownMenuItem icon={<FileText />}>Tailor my CV</DropdownMenuItem>
        <DropdownMenuItem icon={<ArrowUpRight />}>Apply on company site</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={<EyeOff />}>Hide this job</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function AllKindsMenu() {
  const [wide, setWide] = useState(true)
  const [showArchived, setShowArchived] = useState(false)
  const [density, setDensity] = useState('comfortable')
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary">All item kinds</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="kit-gallery__menu-w">
        <DropdownMenuLabel>Document</DropdownMenuLabel>
        <DropdownMenuItem icon={<Pencil />} shortcut="E">
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem icon={<Copy />} shortcut="⌘D">
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem icon={<FileText />} disabled>
          Export (nothing to export)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>View</DropdownMenuLabel>
        <DropdownMenuCheckboxItem checked={wide} onCheckedChange={setWide} onSelect={(event) => event.preventDefault()}>
          Wide margins
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={showArchived} onCheckedChange={setShowArchived} onSelect={(event) => event.preventDefault()}>
          Show archived
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Density</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={density} onValueChange={setDensity}>
          <DropdownMenuRadioItem value="comfortable" onSelect={(event) => event.preventDefault()}>
            Comfortable
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="compact" onSelect={(event) => event.preventDefault()}>
            Compact
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={<Trash2 />} destructive>
          Delete CV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function AccountMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" aria-label="Account menu for Ada Lovelace">
          Ada Lovelace
          <ChevronsUpDown aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" className="kit-gallery__menu-w">
        <DropdownMenuLabel>ada@example.com</DropdownMenuLabel>
        <DropdownMenuItem icon={<UserRound />}>Account</DropdownMenuItem>
        <DropdownMenuItem icon={<Settings2 />}>Settings</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={<LogOut />}>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function LongMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary">Add a section</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="kit-gallery__menu-w kit-gallery__menu-short">
        <DropdownMenuLabel>Add a section</DropdownMenuLabel>
        {['Summary', 'Experience', 'Education', 'Skills', 'Projects', 'Certifications', 'Languages', 'Publications', 'Volunteering', 'Interests'].map((name) => (
          <DropdownMenuItem key={name}>{name}</DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Plain-markup copy of an open menu so every item state is visible at once. Same classes as the real parts. */
function StaticMenu() {
  return (
    <div className="kit-menu kit-gallery__menu-static" role="presentation">
      <div className="kit-menu__label">Document</div>
      <div className="kit-menu__item">
        <span className="kit-menu__icon"><Pencil /></span>
        Rename
        <Kbd className="kit-menu__shortcut">E</Kbd>
      </div>
      <div className="kit-menu__item" data-highlighted="">
        <span className="kit-menu__icon"><Copy /></span>
        Duplicate (highlighted)
        <Kbd className="kit-menu__shortcut">⌘D</Kbd>
      </div>
      <div className="kit-menu__item" data-disabled="">
        <span className="kit-menu__icon"><FileText /></span>
        Export (disabled)
      </div>
      <div className="kit-menu__separator" />
      <div className="kit-menu__label">View</div>
      <div className="kit-menu__item">
        <span className="kit-menu__indicator">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
        </span>
        Wide margins (checked)
      </div>
      <div className="kit-menu__item">
        <span className="kit-menu__indicator" />
        Show archived
      </div>
      <div className="kit-menu__separator" />
      <div className="kit-menu__item" data-tone="danger">
        <span className="kit-menu__icon"><Trash2 /></span>
        Delete CV
      </div>
      <div className="kit-menu__item" data-tone="danger" data-highlighted="">
        <span className="kit-menu__icon"><Trash2 /></span>
        Delete CV (highlighted)
      </div>
    </div>
  )
}

export function MenuSection() {
  return (
    <GallerySection
      id="menu"
      title="Dropdown menu"
      note="Arrow keys move, type-ahead jumps, Enter selects, Esc closes and focus returns to the trigger. Group labels are sentence case, never uppercase. A destructive item goes last, after a separator."
    >
      <Group title="Every item state (static copy)">
        <Specimen label="icon, shortcut, highlighted, disabled, checked, destructive">
          <Stage label="Static preview of a menu" className="kit-gallery__stage--plain">
            <StaticMenu />
          </Stage>
        </Specimen>
      </Group>

      <Group title="Live menus (open them)">
        <Row>
          <MoveToMenu />
          <RowActionsMenu />
          <AllKindsMenu />
          <AccountMenu />
          <LongMenu />
        </Row>
        <p className="kit-gallery__section-note">
          Move to: plain items and a separator. More actions: icon-only trigger, icons in the item slot. All item kinds: label,
          shortcut, disabled, checkbox, radio, destructive. Account: opens upward. Add a section: taller than the space available
          scrolls inside the menu.
        </p>
      </Group>
    </GallerySection>
  )
}
