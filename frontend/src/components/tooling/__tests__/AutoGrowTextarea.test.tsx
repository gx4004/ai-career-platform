import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { AutoGrowTextarea } from '#/components/tooling/AutoGrowTextarea'

function Harness() {
  const [value, setValue] = useState('short')
  return <AutoGrowTextarea aria-label="Opening paragraph" value={value} onChange={(e) => setValue(e.target.value)} />
}

describe('AutoGrowTextarea', () => {
  it('sizes itself to its scroll height and re-measures when the value changes', () => {
    let height = 40
    Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
      configurable: true,
      get: () => height,
    })
    render(<Harness />)
    const area = screen.getByLabelText('Opening paragraph') as HTMLTextAreaElement
    expect(area.style.height).toBe('40px')
    expect(area.rows).toBe(1)

    height = 180
    fireEvent.change(area, { target: { value: 'a much longer paragraph\n'.repeat(6) } })
    expect(area.style.height).toBe('180px')
  })
})
