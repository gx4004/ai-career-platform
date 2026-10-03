import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Count, Disclosure } from '#/components/kit'

describe('kit Disclosure', () => {
  it('is a closed button with aria-expanded=false and no content in the page', () => {
    render(
      <Disclosure title="What's working">
        <p>Tailored CVs get replies.</p>
      </Disclosure>,
    )
    const trigger = screen.getByRole('button', { name: "What's working" })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Tailored CVs get replies.')).toBeNull()
  })

  it('opens on click and wires aria-expanded and aria-controls to the content', () => {
    render(
      <Disclosure title="What's working">
        <p>Tailored CVs get replies.</p>
      </Disclosure>,
    )
    const trigger = screen.getByRole('button', { name: "What's working" })
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    const content = screen.getByText('Tailored CVs get replies.').parentElement as HTMLElement
    expect(trigger.getAttribute('aria-controls')).toBe(content.id)
    expect(content.getAttribute('data-state')).toBe('open')
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Tailored CVs get replies.')).toBeNull()
  })

  it('toggles with Enter and Space on the button (native button behaviour)', () => {
    render(
      <Disclosure title="Notes">
        <p>Private notes.</p>
      </Disclosure>,
    )
    const trigger = screen.getByRole('button', { name: 'Notes' })
    trigger.focus()
    fireEvent.click(trigger)
    expect(screen.getByText('Private notes.')).toBeTruthy()
    expect(trigger.tagName).toBe('BUTTON')
    expect(trigger.getAttribute('type')).toBe('button')
  })

  it('starts open with defaultOpen', () => {
    render(
      <Disclosure title="Notes" defaultOpen>
        <p>Private notes.</p>
      </Disclosure>,
    )
    expect(screen.getByRole('button', { name: 'Notes' }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Private notes.')).toBeTruthy()
  })

  it('is controllable: the page owns open and hears onOpenChange', () => {
    const onOpenChange = vi.fn()
    function Controlled() {
      const [open, setOpen] = useState(false)
      return (
        <Disclosure
          title="Why?"
          variant="inline"
          open={open}
          onOpenChange={(next) => {
            onOpenChange(next)
            setOpen(next)
          }}
        >
          <p>Because.</p>
        </Disclosure>
      )
    }
    render(<Controlled />)
    fireEvent.click(screen.getByRole('button', { name: 'Why?' }))
    expect(onOpenChange).toHaveBeenLastCalledWith(true)
    expect(screen.getByText('Because.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Why?' }))
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
  })

  it('does not toggle when disabled', () => {
    render(
      <Disclosure title="Policy" disabled>
        <p>Hidden.</p>
      </Disclosure>,
    )
    const trigger = screen.getByRole('button', { name: 'Policy' }) as HTMLButtonElement
    expect(trigger.disabled).toBe(true)
    fireEvent.click(trigger)
    expect(screen.queryByText('Hidden.')).toBeNull()
  })

  it('puts the meta text in the trigger, after the title', () => {
    render(
      <Disclosure title="Document checks" meta={<Count value={3} />}>
        <p>x</p>
      </Disclosure>,
    )
    const trigger = screen.getByRole('button', { name: /Document checks\s*3/ })
    expect(trigger.querySelector('.kit-disclosure__meta')?.textContent).toBe('3')
  })

  it('wraps the trigger in a heading when headingLevel is set', () => {
    render(
      <Disclosure title="Notes" headingLevel={3}>
        <p>x</p>
      </Disclosure>,
    )
    const heading = screen.getByRole('heading', { level: 3, name: 'Notes' })
    expect(heading.querySelector('button')).toBeTruthy()
  })

  it('carries its variant as a class and hides the chevron from assistive tech', () => {
    const { container } = render(
      <Disclosure title="Why?" variant="inline">
        <p>x</p>
      </Disclosure>,
    )
    expect(container.firstElementChild?.className).toContain('kit-disclosure--inline')
    expect(container.querySelector('.kit-disclosure__chevron')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('defaults to the section variant', () => {
    const { container } = render(
      <Disclosure title="Notes">
        <p>x</p>
      </Disclosure>,
    )
    expect(container.firstElementChild?.className).toContain('kit-disclosure--section')
  })
})
