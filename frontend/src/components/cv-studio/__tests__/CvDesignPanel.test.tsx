import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CvDesignPanel } from '#/components/cv-studio/CvDesignPanel'
import { CV_ACCENT_PALETTE, cvStyleSchema } from '#/lib/api/schemas'
import { styleCatalogFixture } from '#/lib/cv-studio/__tests__/styleCatalog.fixture'

const style = cvStyleSchema.parse({})

function panel(patch = vi.fn(), current = style) {
  render(<CvDesignPanel style={current} catalog={styleCatalogFixture} onChange={patch} />)
  return patch
}

describe('CvDesignPanel style controls', () => {
  it('offers Template default plus the six catalog typefaces, defaulting to the template pairing', () => {
    const onChange = panel()
    const fonts = within(screen.getByRole('radiogroup', { name: 'Font' })).getAllByRole('radio')
    expect(fonts.map((radio) => radio.closest('label')?.textContent ?? '')).toEqual([
      expect.stringContaining('Template default'),
      expect.stringContaining('Inter'),
      expect.stringContaining('Source Sans 3'),
      expect.stringContaining('IBM Plex Sans'),
      expect.stringContaining('Source Serif 4'),
      expect.stringContaining('Lora'),
      expect.stringContaining('EB Garamond'),
    ])
    expect((screen.getByRole('radio', { name: /Template default/ }) as HTMLInputElement).checked || screen.getByRole('radio', { name: /Template default/ }).getAttribute('aria-checked') === 'true' || screen.getByRole('radio', { name: /Template default/ }).getAttribute('data-state') === 'checked').toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: /Lora/ }))
    expect(onChange).toHaveBeenCalledWith({ font_id: 'lora' })
  })

  it('returns to the template pairing with null', () => {
    const onChange = panel(vi.fn(), { ...style, font_id: 'lora' })
    fireEvent.click(screen.getByRole('radio', { name: /Template default/ }))
    expect(onChange).toHaveBeenCalledWith({ font_id: null })
  })

  it('shows the ten catalog accents as swatches and every one is a valid style colour', () => {
    const onChange = panel()
    const swatches = within(screen.getByRole('radiogroup', { name: 'Accent colour' })).getAllByRole('radio')
    expect(swatches).toHaveLength(10)
    expect(styleCatalogFixture.palette.map((c) => c.value)).toEqual([...CV_ACCENT_PALETTE])
    fireEvent.click(screen.getByRole('radio', { name: 'Plum' }))
    expect(onChange).toHaveBeenCalledWith({ accent_color: '#9D174D' })
    for (const color of CV_ACCENT_PALETTE) expect(cvStyleSchema.parse({ accent_color: color }).accent_color).toBe(color)
  })

  it('has spacing and page size controls', () => {
    const onChange = panel()
    fireEvent.click(screen.getByRole('radio', { name: 'Roomy' }))
    expect(onChange).toHaveBeenCalledWith({ density: 'spacious' })
    fireEvent.click(screen.getByRole('radio', { name: 'Letter' }))
    expect(onChange).toHaveBeenCalledWith({ page_size: 'letter' })
  })

  it('locks typeface, accent and spacing in ATS-friendly mode', () => {
    panel(vi.fn(), { ...style, ats_mode: true })
    expect(screen.getByRole('radio', { name: /Inter/ }).hasAttribute('disabled') || screen.getByRole('radio', { name: /Inter/ }).getAttribute('aria-disabled') === 'true').toBe(true)
    expect(screen.getByRole('radio', { name: 'Plum' }).hasAttribute('disabled') || screen.getByRole('radio', { name: 'Plum' }).getAttribute('aria-disabled') === 'true').toBe(true)
  })
})
