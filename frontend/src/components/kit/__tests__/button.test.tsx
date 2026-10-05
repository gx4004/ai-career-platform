import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Button } from '#/components/kit'

describe('kit Button', () => {
  it('renders a native button with variant and size classes and passes className and native props through', () => {
    render(
      <Button variant="secondary" size="lg" className="extra" data-testid="b" type="submit">
        Save
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button.tagName).toBe('BUTTON')
    expect(button.classList.contains('kit-button')).toBe(true)
    expect(button.classList.contains('kit-button--secondary')).toBe(true)
    expect(button.classList.contains('kit-button--lg')).toBe(true)
    expect(button.classList.contains('extra')).toBe(true)
    expect(button.getAttribute('type')).toBe('submit')
    expect(button.getAttribute('data-testid')).toBe('b')
  })

  it('defaults to primary and md, and does not force a type', () => {
    render(<Button>Go</Button>)
    const button = screen.getByRole('button', { name: 'Go' })
    expect(button.classList.contains('kit-button--primary')).toBe(true)
    expect(button.classList.contains('kit-button--md')).toBe(true)
    expect(button.hasAttribute('type')).toBe(false)
  })

  it('forwards its ref to the button element', () => {
    const ref = createRef<HTMLButtonElement>()
    render(<Button ref={ref}>Ref</Button>)
    expect(ref.current).toBe(screen.getByRole('button', { name: 'Ref' }))
  })

  it('calls onClick when enabled', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Click</Button>)
    fireEvent.click(screen.getByRole('button', { name: 'Click' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('is natively disabled and ignores clicks when disabled', () => {
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        Nope
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Nope' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('shows a spinner while loading, stays focusable, announces busy and ignores clicks', () => {
    const onClick = vi.fn()
    render(
      <Button loading onClick={onClick}>
        Saving
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Saving' }) as HTMLButtonElement
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect(button.getAttribute('data-loading')).toBe('true')
    expect(button.disabled).toBe(false)
    expect(button.querySelector('.kit-button__spinner')?.getAttribute('aria-hidden')).toBe('true')
    // The label stays in the DOM so the width does not change.
    expect(button.textContent).toBe('Saving')
    button.focus()
    expect(document.activeElement).toBe(button)
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('does not submit a form while loading', () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault())
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit" loading>
          Send
        </Button>
      </form>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('renders an icon-only button that is named by aria-label and square', () => {
    render(
      <Button iconOnly aria-label="Close" variant="ghost">
        <svg aria-hidden="true" />
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Close' })
    expect(button.classList.contains('kit-button--icon')).toBe(true)
  })

  it('asChild puts the button classes on the child link and keeps its href', () => {
    render(
      <Button asChild variant="secondary">
        <a href="/discovery">Find jobs</a>
      </Button>,
    )
    const link = screen.getByRole('link', { name: 'Find jobs' })
    expect(link.getAttribute('href')).toBe('/discovery')
    expect(link.classList.contains('kit-button')).toBe(true)
    expect(link.classList.contains('kit-button--secondary')).toBe(true)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('asChild disabled is not tabbable, is aria-disabled and swallows clicks', () => {
    const onClick = vi.fn()
    render(
      <Button asChild disabled onClick={onClick}>
        <a href="/x">Unavailable</a>
      </Button>,
    )
    const link = screen.getByRole('link', { name: 'Unavailable' })
    expect(link.getAttribute('aria-disabled')).toBe('true')
    expect(link.getAttribute('tabindex')).toBe('-1')
    expect(link.getAttribute('data-disabled')).toBe('true')
    expect(fireEvent.click(link)).toBe(false) // default prevented: no navigation
    expect(onClick).not.toHaveBeenCalled()
  })

  it('asChild loading keeps the label and adds the spinner inside the link', () => {
    render(
      <Button asChild loading>
        <a href="/x">Open</a>
      </Button>,
    )
    const link = screen.getByRole('link', { name: 'Open' })
    expect(link.getAttribute('aria-busy')).toBe('true')
    expect(link.querySelector('.kit-button__spinner')).toBeTruthy()
    expect(link.textContent).toBe('Open')
  })

  it('works as a toggle through aria-pressed', () => {
    render(<Button aria-pressed>Starred</Button>)
    expect(screen.getByRole('button', { name: 'Starred', pressed: true })).toBeTruthy()
  })
})

describe('Button Sticker contract (button.css)', () => {
  const css = readFileSync(path.resolve(__dirname, '../../../styles/kit/button.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

  it('rests as a 2px ink outline with the hard sh-2 shadow, radius 16 and 44px minimum height', () => {
    const base = css.match(/\.kit-button\s*\{([^}]*)\}/)![1]
    expect(base).toMatch(/--kit-button-shadow:\s*var\(--sh-2\)/)
    expect(base).toMatch(/--kit-button-radius:\s*var\(--r-md\)/)
    expect(base).toMatch(/--kit-button-h:\s*var\(--kit-h-md\)/)
    expect(base).toMatch(/border:\s*var\(--bw\) solid/)
  })

  it('lifts on hover and sinks on press, hover only for a fine pointer', () => {
    const hover = css.match(/@media \(hover: hover\)\s*\{([\s\S]*?)\n\}/)![1]
    expect(hover).toMatch(/transform:\s*translate\(var\(--kit-button-lift\)/)
    expect(hover).toMatch(/box-shadow:\s*var\(--kit-button-shadow-hover\)/)
    expect(css).toMatch(/:active\s*\{[^}]*box-shadow:\s*var\(--sh-0\)[^}]*translate\(var\(--kit-button-press\)/)
    expect(css).toMatch(/--kit-button-lift:\s*-2px/)
    expect(css).toMatch(/--kit-button-press:\s*4px/)
  })

  it('never lifts a ghost or link button, and never changes the radius on focus', () => {
    expect(css.match(/\.kit-button--ghost\s*\{([^}]*)\}/)![1]).toMatch(/--kit-button-lift:\s*0px/)
    expect(css.match(/\.kit-button--link\s*\{([^}]*)\}/)![1]).toMatch(/--kit-button-lift:\s*0px/)
    expect(css.match(/\.kit-button:focus-visible\s*\{([^}]*)\}/)![1]).not.toMatch(/radius/)
  })

  it('primary is tangerine with ink text, disabled is flat stone without a shadow, loading keeps the shadow', () => {
    expect(css.match(/\.kit-button--primary\s*\{([^}]*)\}/)![1]).toMatch(/--kit-button-bg:\s*var\(--primary\)[\s\S]*--kit-button-fg:\s*var\(--primary-on\)/)
    const disabled = css.match(/\.kit-button:is\(:disabled, \[data-disabled='true'\]\)\s*\{([^}]*)\}/)![1]
    expect(disabled).toMatch(/--kit-button-bg:\s*var\(--stone\)/)
    expect(disabled).toMatch(/--kit-button-shadow:\s*none/)
    expect(css.match(/\.kit-button\[data-loading='true'\]\s*\{([^}]*)\}/)![1]).not.toMatch(/box-shadow|--kit-button-shadow/)
  })
})
