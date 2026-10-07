import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogForm,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  focusFieldOnOpen,
} from '#/components/kit'

function Basic({ size, dismissible }: { size?: 'sm' | 'md' | 'lg'; dismissible?: boolean }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Open</Button>
      </DialogTrigger>
      <DialogContent size={size} dismissible={dismissible}>
        <DialogHeader>
          <DialogTitle>Rename CV</DialogTitle>
          <DialogDescription>Only you see the name.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <input aria-label="Name" />
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const open = () => fireEvent.click(screen.getByRole('button', { name: 'Open' }))
const settle = () => new Promise((resolve) => setTimeout(resolve, 10))

afterEach(() => vi.restoreAllMocks())

describe('kit Dialog', () => {
  it('opens as a labelled, described modal dialog', () => {
    render(<Basic />)
    expect(screen.queryByRole('dialog')).toBeNull()
    open()
    const dialog = screen.getByRole('dialog', { name: 'Rename CV' })
    expect(dialog.getAttribute('aria-describedby')).toBe(screen.getByText('Only you see the name.').id)
    expect(dialog.getAttribute('aria-labelledby')).toBe(screen.getByText('Rename CV').id)
    expect(dialog.getAttribute('data-state')).toBe('open')
  })

  it('has a flat scrim and carries its size as data-size', () => {
    render(<Basic size="lg" />)
    open()
    expect(screen.getByRole('dialog').getAttribute('data-size')).toBe('lg')
    expect(document.querySelector('.kit-scrim')).toBeTruthy()
  })

  it('defaults to the md size', () => {
    render(<Basic />)
    open()
    expect(screen.getByRole('dialog').getAttribute('data-size')).toBe('md')
  })

  it('is centred by default and can be anchored near the top, so a body that changes height never moves it', () => {
    const { unmount } = render(<Basic />)
    open()
    expect(screen.getByRole('dialog').hasAttribute('data-placement')).toBe(false)
    unmount()

    render(
      <Dialog defaultOpen>
        <DialogContent placement="top" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Step 1 of 5</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    )
    expect(screen.getByRole('dialog').getAttribute('data-placement')).toBe('top')
  })

  it('stacks footer buttons on phones by default, and keeps a stepper footer on one row with phoneLayout="row"', () => {
    render(
      <Dialog defaultOpen>
        <DialogContent placement="top" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Step 2 of 5</DialogTitle>
          </DialogHeader>
          <DialogFooter data-testid="default-footer">
            <Button>Save</Button>
          </DialogFooter>
          <DialogFooter data-testid="row-footer" phoneLayout="row">
            <Button variant="secondary">Back</Button>
            <Button>Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    )
    expect(screen.getByTestId('default-footer').hasAttribute('data-phone-layout')).toBe(false)
    expect(screen.getByTestId('row-footer').getAttribute('data-phone-layout')).toBe('row')
  })

  it('portals to the body and locks page scroll while open', () => {
    const { container } = render(<Basic />)
    open()
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(document.body.querySelector('[role="dialog"]')).toBeTruthy()
    expect(document.body.hasAttribute('data-scroll-locked')).toBe(true)
  })

  it('closes with Escape and returns focus to the trigger', async () => {
    render(<Basic />)
    const trigger = screen.getByRole('button', { name: 'Open' })
    trigger.focus()
    open()
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('closes from the X button, which has an accessible name', () => {
    render(<Basic />)
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes on a click outside', async () => {
    render(<Basic />)
    open()
    await settle()
    fireEvent.pointerDown(document.body)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('moves focus into the dialog on open', async () => {
    render(<Basic />)
    open()
    await waitFor(() => expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true))
  })

  it('starts on its first field with a mouse, but on the panel itself on a touch screen (no keyboard over the dialog)', async () => {
    render(<Basic />)
    open()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Name' })))
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    const coarse = (query: string) => ({
      matches: /pointer:\s*coarse/.test(query),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
    vi.stubGlobal('matchMedia', coarse)
    try {
      open()
      const dialog = screen.getByRole('dialog')
      await waitFor(() => expect(document.activeElement).toBe(dialog))
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('on a touch screen still starts on a first button (nothing raises a keyboard)', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: /pointer:\s*coarse/.test(query), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    try {
      render(
        <Dialog defaultOpen>
          <DialogContent aria-describedby={undefined} showClose={false}>
            <DialogTitle>Pick one</DialogTitle>
            <DialogFooter>
              <Button>Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>,
      )
      await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Done' })))
    } finally {
      vi.unstubAllGlobals()
    }
  })

  // consistency-F24: a dialog that picks its own starting field (the first empty one, a sign-in email) keeps the kit's
  // touch rule through focusFieldOnOpen: that field with a mouse, the panel on a touch screen.
  it('focusFieldOnOpen starts on the chosen field with a mouse and on the panel on a touch screen', async () => {
    const Picked = () => (
      <Dialog defaultOpen>
        <DialogContent
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => focusFieldOnOpen(event, (event.target as HTMLElement).querySelector<HTMLElement>('[name="second"]'))}
        >
          <DialogTitle>Two fields</DialogTitle>
          <input aria-label="First" name="first" />
          <input aria-label="Second" name="second" />
        </DialogContent>
      </Dialog>
    )
    const view = render(<Picked />)
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Second' })))
    view.unmount()

    vi.stubGlobal('matchMedia', (query: string) => ({ matches: /pointer:\s*coarse/.test(query), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    try {
      render(<Picked />)
      await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('dialog')))
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('does not close on Escape, outside click or X when dismissible is false', async () => {
    render(<Basic dismissible={false} />)
    open()
    await settle()
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    fireEvent.pointerDown(document.body)
    await settle()
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('hides the X with showClose={false}', () => {
    render(
      <Dialog defaultOpen>
        <DialogContent showClose={false} aria-describedby={undefined}>
          <DialogTitle>Title</DialogTitle>
        </DialogContent>
      </Dialog>,
    )
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
  })

  it('keeps a title that is visually hidden available to assistive tech', () => {
    render(
      <Dialog defaultOpen>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle visuallyHidden>Sign in</DialogTitle>
        </DialogContent>
      </Dialog>,
    )
    const title = screen.getByRole('dialog', { name: 'Sign in' })
    expect(title).toBeTruthy()
    expect(screen.getByText('Sign in').className).toContain('kit-sr-only')
  })

  it('wraps header, body and footer in a form so Enter submits', () => {
    const onSubmit = vi.fn((event) => event.preventDefault())
    render(
      <Dialog defaultOpen>
        <DialogContent aria-describedby={undefined}>
          <DialogForm onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>New CV</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <input aria-label="Name" />
            </DialogBody>
            <DialogFooter>
              <Button type="submit">Create</Button>
            </DialogFooter>
          </DialogForm>
        </DialogContent>
      </Dialog>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('makes an overflowing body keyboard focusable but starts focus on the first control, not on the body', async () => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('kit-panel__body') ? 800 : 0
    })
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('kit-panel__body') ? 200 : 0
    })
    render(
      <Dialog defaultOpen>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Long</DialogTitle>
          <DialogBody>{'Long text. '.repeat(100)}</DialogBody>
          <DialogFooter>
            <Button>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    )
    const body = document.querySelector('.kit-panel__body') as HTMLElement
    await waitFor(() => expect(body.getAttribute('tabindex')).toBe('0'))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Done' })))
  })

  it('returns focus to the opener when it was opened without a DialogTrigger', async () => {
    function Controlled() {
      const [isOpen, setOpen] = useState(false)
      return (
        <>
          <button onClick={() => setOpen(true)}>Open it</button>
          <Dialog open={isOpen} onOpenChange={setOpen}>
            <DialogContent aria-describedby={undefined}>
              <DialogTitle>Controlled</DialogTitle>
            </DialogContent>
          </Dialog>
        </>
      )
    }
    render(<Controlled />)
    const opener = screen.getByRole('button', { name: 'Open it' })
    opener.focus()
    fireEvent.click(opener)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(opener))
  })
})

describe('kit ConfirmDialog', () => {
  function Confirm({ pending = false, tone }: { pending?: boolean; tone?: 'destructive' | 'default' }) {
    const [isOpen, setOpen] = useState(false)
    return (
      <>
        <button onClick={() => setOpen(true)}>Delete</button>
        <ConfirmDialog
          open={isOpen}
          onOpenChange={setOpen}
          title="Delete this application?"
          description="Its notes are removed for good."
          confirmLabel="Delete application"
          tone={tone}
          pending={pending}
          onConfirm={() => undefined}
        />
      </>
    )
  }

  it('is an alertdialog named by its title and described by its text', () => {
    render(<Confirm />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Delete this application?' })
    expect(dialog.getAttribute('aria-describedby')).toBe(screen.getByText('Its notes are removed for good.').id)
  })

  it('opens focused on Cancel, the safe choice', async () => {
    render(<Confirm />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' })))
  })

  it('tints the header band rose for a destructive confirm only', () => {
    const { unmount } = render(<Confirm />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('alertdialog').querySelector('.kit-panel__header')?.getAttribute('data-tone')).toBe('danger')
    unmount()
    render(<Confirm tone="default" />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('alertdialog').querySelector('.kit-panel__header')?.hasAttribute('data-tone')).toBe(false)
  })

  it('uses the red destructive button by default and the primary one for tone="default"', () => {
    const { unmount } = render(<Confirm />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('button', { name: 'Delete application' }).className).toContain('kit-button--destructive')
    unmount()
    render(<Confirm tone="default" />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('button', { name: 'Delete application' }).className).toContain('kit-button--primary')
  })

  it('calls onConfirm and does not close itself', () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmDialog open onOpenChange={() => undefined} title="Sure?" confirmLabel="Yes, do it" onConfirm={onConfirm} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Yes, do it' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alertdialog')).toBeTruthy()
  })

  it('cancels with the Cancel button and Escape', async () => {
    const onOpenChange = vi.fn()
    render(<ConfirmDialog open onOpenChange={onOpenChange} title="Sure?" confirmLabel="Yes" onConfirm={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledTimes(2)
  })

  it('while pending: busy confirm button, disabled Cancel, and Escape or outside clicks are ignored', async () => {
    const onOpenChange = vi.fn()
    render(<ConfirmDialog open onOpenChange={onOpenChange} pending title="Sure?" confirmLabel="Yes" onConfirm={() => undefined} />)
    await settle()
    const confirm = screen.getByRole('button', { name: 'Yes' })
    expect(confirm.getAttribute('aria-busy')).toBe('true')
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    fireEvent.pointerDown(document.body)
    await settle()
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toBeTruthy()
  })
})
