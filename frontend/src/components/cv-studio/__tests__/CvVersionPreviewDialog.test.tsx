import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CvVersionPreviewDialog } from '#/components/cv-studio/CvVersionPreviewDialog'
import type { CvSection } from '#/lib/api/schemas'
import { styleCatalogFixture } from '#/lib/cv-studio/__tests__/styleCatalog.fixture'

const skills: CvSection = { id: 's2', kind: 'skills', title: 'Skills', visible: true, position: 0, entries: [{ id: 'e2', evidence_item_id: null, body: 'Figma, research', position: 0 }] }
const variant = { id: 'v1', name: 'Before tailoring', target_role: null, sections: [skills], created_at: '2026-10-07T10:00:00Z' }
const style = { template_id: 'ats-essential' as const, font_id: 'lato' as const, accent_color: '#111827' as const, density: 'normal' as const, ats_mode: false }

function view(onExport = vi.fn()) {
  render(
    <CvVersionPreviewDialog
      variant={variant} documentName="Dana Reyes CV" style={style} catalog={styleCatalogFixture} currentSections={[skills]}
      exporting={null} canRestore error="" onOpenChange={vi.fn()} onExport={onExport} onRestore={vi.fn()}
    />,
  )
  return onExport
}

beforeEach(() => { window.innerWidth = 1440 })

describe('version preview dialog', () => {
  it('offers PDF, DOCX and Use as my CV, with what changed, on a wide screen', () => {
    view()
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('button', { name: /PDF/ })).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: /DOCX/ })).toBeTruthy()
    expect(within(dialog).getByText(/Same wording as your CV now\. Your CV changes only if you use this version\./)).toBeTruthy()
  })

  it('gives the preview the room on a phone: one Export menu and Use as my CV, two buttons not three, a short description (cv-studio-G13)', () => {
    window.innerWidth = 320
    const onExport = view()
    const dialog = screen.getByRole('dialog')
    const footer = dialog.querySelector('.kit-panel__footer')!
    // Stacked by the kit's phone footer: side by side they need 295px, and a 320 screen's footer has 240.
    expect(footer.getAttribute('data-phone-layout')).toBeNull()
    expect(within(dialog).queryByRole('button', { name: /^PDF$/ })).toBeNull()
    expect(within(dialog).queryByRole('button', { name: /DOCX/ })).toBeNull()
    expect(within(footer as HTMLElement).getAllByRole('button').map((button) => button.textContent?.trim())).toEqual(['Use as my CV', 'Export'])
    expect(within(dialog).queryByText(/Same wording/)).toBeNull()
    expect(within(dialog).getByText('Your CV changes only if you use this version.')).toBeTruthy()
    fireEvent.keyDown(within(dialog).getByRole('button', { name: 'Export' }), { key: 'Enter' })
    fireEvent.click(screen.getByRole('menuitem', { name: 'DOCX' }))
    expect(onExport).toHaveBeenCalledWith(variant, 'docx')
  })
})
