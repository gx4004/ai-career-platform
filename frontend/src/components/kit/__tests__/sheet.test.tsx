import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  Button,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  type SheetSide,
} from '#/components/kit'

function Demo({ side, size }: { side?: SheetSide; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button>Open</Button>
      </SheetTrigger>
      <SheetContent side={side} size={size}>
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>Narrow the list.</SheetDescription>
        </SheetHeader>
        <SheetBody>Body</SheetBody>
        <SheetFooter>
          <Button>Show jobs</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

const open = () => fireEvent.click(screen.getByRole('button', { name: 'Open' }))

describe('kit Sheet', () => {
  it('is a labelled, described modal dialog', () => {
    render(<Demo />)
    open()
    const sheet = screen.getByRole('dialog', { name: 'Filters' })
    expect(sheet.getAttribute('aria-describedby')).toBe(screen.getByText('Narrow the list.').id)
  })

  it('defaults to the responsive side (drawer on desktop, bottom sheet on mobile) and md size', () => {
    render(<Demo />)
    open()
    const sheet = screen.getByRole('dialog')
    expect(sheet.getAttribute('data-side')).toBe('responsive')
    expect(sheet.getAttribute('data-size')).toBe('md')
  })

  it('carries side and size as data attributes', () => {
    render(<Demo side="bottom" size="lg" />)
    open()
    const sheet = screen.getByRole('dialog')
    expect(sheet.getAttribute('data-side')).toBe('bottom')
    expect(sheet.getAttribute('data-size')).toBe('lg')
  })

  it('carries a decorative grab bar before the header, hidden from assistive tech', () => {
    render(<Demo side="bottom" />)
    open()
    const grab = screen.getByRole('dialog').querySelector('.kit-sheet__grab')
    expect(grab).toBeTruthy()
    expect(grab?.getAttribute('aria-hidden')).toBe('true')
    expect(screen.getByRole('dialog').firstElementChild).toBe(grab)
  })

  it('closes with Escape and focus returns to the trigger', async () => {
    render(<Demo />)
    const trigger = screen.getByRole('button', { name: 'Open' })
    trigger.focus()
    open()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('closes from the X button', () => {
    render(<Demo />)
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
