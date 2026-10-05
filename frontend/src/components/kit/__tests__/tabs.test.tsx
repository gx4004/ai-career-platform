import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/kit'

function Demo({ onValue }: { onValue?: (value: string) => void }) {
  const [value, setValue] = useState('active')
  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        setValue(next)
        onValue?.(next)
      }}
    >
      <TabsList aria-label="Applications">
        <TabsTrigger value="active" count={7}>
          Active
        </TabsTrigger>
        <TabsTrigger value="saved" count={12}>
          Saved
        </TabsTrigger>
        <TabsTrigger value="archive" disabled>
          Archive
        </TabsTrigger>
        <TabsTrigger value="closed">Closed</TabsTrigger>
      </TabsList>
      <TabsContent value="active">Seven active</TabsContent>
      <TabsContent value="saved">Twelve saved</TabsContent>
      <TabsContent value="closed">Closed ones</TabsContent>
    </Tabs>
  )
}

const tab = (name: RegExp | string) => screen.getByRole('tab', { name })

describe('kit Tabs', () => {
  it('renders a named tablist with one selected tab and its panel', () => {
    render(<Demo />)
    expect(screen.getByRole('tablist', { name: 'Applications' })).toBeTruthy()
    expect(screen.getAllByRole('tab')).toHaveLength(4)
    expect(tab(/^Active/).getAttribute('aria-selected')).toBe('true')
    expect(tab(/^Active/).getAttribute('data-state')).toBe('active')
    expect(tab(/^Saved/).getAttribute('aria-selected')).toBe('false')
    const panel = screen.getByRole('tabpanel')
    expect(panel.textContent).toBe('Seven active')
    expect(panel.getAttribute('aria-labelledby')).toBe(tab(/^Active/).id)
    expect(tab(/^Active/).getAttribute('aria-controls')).toBe(panel.id)
  })

  it('shows the count after the label and includes it in the tab name', () => {
    render(<Demo />)
    expect(tab(/^Saved\s*12$/).querySelector('.kit-count')?.textContent).toBe('12')
    expect(tab('Closed').querySelector('.kit-count')).toBeNull()
  })

  it('activates a tab on click', () => {
    render(<Demo />)
    fireEvent.mouseDown(tab(/^Saved/))
    fireEvent.click(tab(/^Saved/))
    expect(screen.getByRole('tabpanel').textContent).toBe('Twelve saved')
  })

  it('moves focus and selection with the arrow keys, skipping disabled tabs', async () => {
    render(<Demo />)
    tab(/^Active/).focus()
    fireEvent.keyDown(tab(/^Active/), { key: 'ArrowRight' })
    await waitFor(() => expect(tab(/^Saved/).getAttribute('aria-selected')).toBe('true'))
    expect(document.activeElement).toBe(tab(/^Saved/))
    fireEvent.keyDown(tab(/^Saved/), { key: 'ArrowRight' })
    await waitFor(() => expect(tab('Closed').getAttribute('aria-selected')).toBe('true'))
    fireEvent.keyDown(tab('Closed'), { key: 'ArrowRight' })
    await waitFor(() => expect(tab(/^Active/).getAttribute('aria-selected')).toBe('true'))
  })

  it('jumps with Home and End', async () => {
    render(<Demo />)
    tab(/^Active/).focus()
    fireEvent.keyDown(tab(/^Active/), { key: 'End' })
    await waitFor(() => expect(tab('Closed').getAttribute('aria-selected')).toBe('true'))
    fireEvent.keyDown(tab('Closed'), { key: 'Home' })
    await waitFor(() => expect(tab(/^Active/).getAttribute('aria-selected')).toBe('true'))
  })

  it('keeps a single tab stop (roving tabindex) and disables disabled tabs', () => {
    render(<Demo />)
    act(() => tab(/^Active/).focus())
    expect(tab(/^Active/).getAttribute('tabindex')).toBe('0')
    expect(tab(/^Saved/).getAttribute('tabindex')).toBe('-1')
    expect((tab('Archive') as HTMLButtonElement).disabled).toBe(true)
  })

  it('is a folder tab set by default and a plain one on request', () => {
    const { container, rerender } = render(<Demo />)
    expect(container.querySelector('.kit-tabs')?.getAttribute('data-variant')).toBe('folder')
    rerender(
      <Tabs defaultValue="a" variant="plain">
        <TabsList aria-label="Letters">
          <TabsTrigger value="a">Alpha</TabsTrigger>
        </TabsList>
        <TabsContent value="a">A</TabsContent>
      </Tabs>,
    )
    expect(container.querySelector('.kit-tabs')?.getAttribute('data-variant')).toBe('plain')
  })

  it('draws the count as a lemon pill', () => {
    render(<Demo />)
    const count = tab(/^Saved/).querySelector('.kit-count')
    expect(count?.getAttribute('data-variant')).toBe('pill')
    expect(count?.getAttribute('data-tone')).toBe('lemon')
  })

  it('works uncontrolled with defaultValue and renders an icon', () => {
    render(
      <Tabs defaultValue="b">
        <TabsList aria-label="Letters">
          <TabsTrigger value="a" icon={<svg data-testid="tab-icon" />}>
            Alpha
          </TabsTrigger>
          <TabsTrigger value="b">Beta</TabsTrigger>
        </TabsList>
        <TabsContent value="a">A</TabsContent>
        <TabsContent value="b">B</TabsContent>
      </Tabs>,
    )
    expect(tab('Beta').getAttribute('aria-selected')).toBe('true')
    expect(screen.getByTestId('tab-icon')).toBeTruthy()
  })
})
