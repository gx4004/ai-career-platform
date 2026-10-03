import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipProvider,
} from '#/components/kit'

function openMenu(name = 'Actions') {
  const trigger = screen.getByRole('button', { name })
  trigger.focus()
  fireEvent.keyDown(trigger, { key: 'Enter' })
  return trigger
}

const press = (key: string) => fireEvent.keyDown(document.activeElement ?? document.body, { key })

function ActionsMenu({ onRename = vi.fn(), onDelete = vi.fn() }: { onRename?: () => void; onDelete?: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary">Actions</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Document</DropdownMenuLabel>
        <DropdownMenuItem icon={<svg data-testid="icon" />} shortcut="E" onSelect={onRename}>
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem disabled>Export</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={onDelete}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

describe('kit DropdownMenu', () => {
  it('opens from the keyboard into a menu of menuitems, named by the trigger', () => {
    render(<ActionsMenu />)
    const trigger = openMenu()
    const menu = screen.getByRole('menu')
    expect(menu.getAttribute('aria-labelledby')).toBe(trigger.id)
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['RenameE', 'Export', 'Delete'])
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
  })

  it('moves with the arrow keys, skips disabled items, and selects with Enter', async () => {
    const onRename = vi.fn()
    const onDelete = vi.fn()
    render(<ActionsMenu onRename={onRename} onDelete={onDelete} />)
    openMenu()
    press('ArrowDown')
    await waitFor(() => expect(document.activeElement?.textContent).toContain('Rename'))
    press('ArrowDown')
    await waitFor(() => expect(document.activeElement?.textContent).toBe('Delete'))
    press('Enter')
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onRename).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })

  it('marks disabled and destructive items with attributes, not classes', () => {
    render(<ActionsMenu />)
    openMenu()
    const [rename, exportItem, del] = screen.getAllByRole('menuitem')
    expect(rename.getAttribute('data-tone')).toBeNull()
    expect(exportItem.getAttribute('aria-disabled')).toBe('true')
    expect(exportItem.hasAttribute('data-disabled')).toBe(true)
    expect(del.getAttribute('data-tone')).toBe('danger')
  })

  it('renders the icon slot as decorative and the shortcut as a Kbd', () => {
    render(<ActionsMenu />)
    openMenu()
    const icon = screen.getByTestId('icon')
    expect(icon.parentElement?.getAttribute('aria-hidden')).toBe('true')
    const kbd = document.querySelector('kbd.kit-menu__shortcut')
    expect(kbd?.textContent).toBe('E')
  })

  it('draws the label as a plain group heading', () => {
    render(<ActionsMenu />)
    openMenu()
    const label = screen.getByText('Document')
    expect(label.className).toContain('kit-menu__label')
    expect(screen.getByRole('separator')).toBeTruthy()
  })

  it('closes on Escape and returns focus to the trigger', async () => {
    render(<ActionsMenu />)
    const trigger = openMenu()
    press('Escape')
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('supports checkbox and radio items with aria-checked and an onSelect that keeps the menu open', async () => {
    function ViewMenu() {
      const [wide, setWide] = useState(false)
      const [density, setDensity] = useState('comfortable')
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button>View</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuCheckboxItem checked={wide} onCheckedChange={setWide} onSelect={(event) => event.preventDefault()}>
              Wide margins
            </DropdownMenuCheckboxItem>
            <DropdownMenuRadioGroup value={density} onValueChange={setDensity}>
              <DropdownMenuRadioItem value="comfortable">Comfortable</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="compact">Compact</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
    render(<ViewMenu />)
    openMenu('View')
    const wide = screen.getByRole('menuitemcheckbox', { name: 'Wide margins' })
    expect(wide.getAttribute('aria-checked')).toBe('false')
    fireEvent.keyDown(wide, { key: 'Enter' })
    await waitFor(() => expect(screen.getByRole('menuitemcheckbox', { name: 'Wide margins' }).getAttribute('aria-checked')).toBe('true'))
    expect(screen.getByRole('menu')).toBeTruthy()

    const comfortable = screen.getByRole('menuitemradio', { name: 'Comfortable' })
    expect(comfortable.getAttribute('aria-checked')).toBe('true')
    fireEvent.keyDown(screen.getByRole('menuitemradio', { name: 'Compact' }), { key: 'Enter' })
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })

  it('lets an item render as a link with asChild and still receive its icon', () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>Go</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem asChild icon={<svg data-testid="link-icon" />}>
            <a href="/account">Account</a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    )
    openMenu('Go')
    const link = screen.getByRole('menuitem', { name: 'Account' })
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('href')).toBe('/account')
    expect(link.querySelector('[data-testid="link-icon"]')).toBeTruthy()
  })
})

describe('kit Popover', () => {
  function Demo() {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button iconOnly variant="ghost" aria-label="What does this score mean?">
            ?
          </Button>
        </PopoverTrigger>
        <PopoverContent>It reflects the structure of your resume.</PopoverContent>
      </Popover>
    )
  }

  it('opens on click, wiring aria-expanded and aria-controls', () => {
    render(<Demo />)
    const trigger = screen.getByRole('button', { name: 'What does this score mean?' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(trigger)
    const panel = screen.getByRole('dialog')
    expect(panel.textContent).toContain('It reflects the structure')
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(trigger.getAttribute('aria-controls')).toBe(panel.id)
    expect(panel.getAttribute('data-state')).toBe('open')
  })

  it('closes on Escape and returns focus to the trigger', async () => {
    render(<Demo />)
    const trigger = screen.getByRole('button', { name: 'What does this score mean?' })
    trigger.focus()
    fireEvent.click(trigger)
    press('Escape')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('stays out of the page layout: it is portalled to the body', () => {
    const { container } = render(<Demo />)
    fireEvent.click(screen.getByRole('button', { name: 'What does this score mean?' }))
    expect(container.querySelector('.kit-popover')).toBeNull()
    expect(document.body.querySelector('.kit-popover')).toBeTruthy()
  })
})

describe('kit Tooltip', () => {
  function Demo({ shortcut }: { shortcut?: string }) {
    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip content="Copy link" shortcut={shortcut}>
          <Button iconOnly variant="ghost" aria-label="Copy">
            C
          </Button>
        </Tooltip>
      </TooltipProvider>
    )
  }

  it('opens on keyboard focus with role=tooltip and describes the trigger', async () => {
    render(<Demo />)
    const trigger = screen.getByRole('button', { name: 'Copy' })
    expect(screen.queryByRole('tooltip')).toBeNull()
    act(() => trigger.focus())
    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip.textContent).toBe('Copy link')
    expect(trigger.getAttribute('aria-describedby')).toBeTruthy()
  })

  it('closes on Escape', async () => {
    render(<Demo />)
    act(() => screen.getByRole('button', { name: 'Copy' }).focus())
    await screen.findByRole('tooltip')
    press('Escape')
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull())
  })

  it('shows a shortcut as a Kbd', async () => {
    render(<Demo shortcut="⌘K" />)
    act(() => screen.getByRole('button', { name: 'Copy' }).focus())
    await screen.findByRole('tooltip')
    expect(document.querySelector('.kit-tooltip kbd')?.textContent).toBe('⌘K')
  })

  it('works without a TooltipProvider', async () => {
    render(
      <Tooltip content="Alone">
        <Button>Hover me</Button>
      </Tooltip>,
    )
    act(() => screen.getByRole('button', { name: 'Hover me' }).focus())
    expect((await screen.findByRole('tooltip')).textContent).toBe('Alone')
  })
})
