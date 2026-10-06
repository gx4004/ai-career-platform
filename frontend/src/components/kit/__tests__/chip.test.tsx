import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Chip } from '#/components/kit'

describe('kit Chip', () => {
  it('renders the term without a remove button unless it can be removed', () => {
    render(<Chip>Berlin</Chip>)
    expect(screen.getByText('Berlin')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('names the remove button and calls onRemove', () => {
    const onRemove = vi.fn()
    render(
      <Chip onRemove={onRemove} removeLabel="Remove backend">
        backend
      </Chip>,
    )
    const remove = screen.getByRole('button', { name: 'Remove backend' })
    expect(remove.getAttribute('type')).toBe('button')
    fireEvent.click(remove)
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('does not submit a surrounding form and can be disabled', () => {
    const onSubmit = vi.fn((event) => event.preventDefault())
    const onRemove = vi.fn()
    render(
      <form onSubmit={onSubmit}>
        <Chip onRemove={onRemove} disabled>
          Berlin
        </Chip>
      </form>,
    )
    const remove = screen.getByRole('button', { name: 'Remove' }) as HTMLButtonElement
    expect(remove.disabled).toBe(true)
    expect(remove.closest('.kit-chip')?.getAttribute('data-disabled')).toBe('true')
    fireEvent.click(remove)
    expect(onRemove).not.toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('forwards the ref and className to the chip', () => {
    const ref = createRef<HTMLSpanElement>()
    render(
      <Chip ref={ref} className="extra" data-testid="chip">
        Remote
      </Chip>,
    )
    expect(ref.current?.classList.contains('kit-chip')).toBe(true)
    expect(ref.current?.classList.contains('extra')).toBe(true)
  })
})
