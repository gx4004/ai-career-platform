import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CvOutline } from '#/components/cv-studio/CvOutline'

const sections = ['Summary', 'Experience', 'Skills'].map((title, position) => ({
  id: title.toLowerCase(), kind: 'custom' as const, title, visible: true, position, entries: [],
}))

function view() {
  const handlers = { onMove: vi.fn(), onMoveTo: vi.fn(), onToggle: vi.fn(), onAdd: vi.fn(), onFocusSection: vi.fn() }
  render(<CvOutline sections={sections} {...handlers} />)
  return handlers
}

describe('CV outline', () => {
  it('reorders by drag and drop and announces the new position', () => {
    const { onMoveTo } = view()
    const items = screen.getAllByRole('listitem')
    const dataTransfer = { setData: vi.fn(), effectAllowed: '' }
    fireEvent.dragStart(items[2], { dataTransfer })
    fireEvent.dragOver(items[0], { dataTransfer })
    fireEvent.drop(items[0], { dataTransfer })
    expect(onMoveTo).toHaveBeenCalledWith(2, 0)
    expect(screen.getByText('Skills moved to position 1 of 3.')).toBeTruthy()
  })

  it('moves with the arrow keys on the handle, ignoring moves past either end', () => {
    const { onMove, onFocusSection } = view()
    fireEvent.keyDown(screen.getByRole('button', { name: /Reorder Summary/ }), { key: 'ArrowUp' })
    expect(onMove).not.toHaveBeenCalled()
    fireEvent.keyDown(screen.getByRole('button', { name: /Reorder Summary/ }), { key: 'ArrowDown' })
    expect(onMove).toHaveBeenCalledWith(0, 1)
    fireEvent.click(screen.getByRole('button', { name: /^Experience/ }))
    expect(onFocusSection).toHaveBeenCalledWith('experience')
  })
})
