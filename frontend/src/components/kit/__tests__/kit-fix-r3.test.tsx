import { readFileSync } from 'node:fs'
import path from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Count, Disclosure } from '#/components/kit'
import { KitPage } from '#/pages/kit-page'

// Sign-off round 2, the confirmed kit and app-CSS review findings (KIT-1..5, KIT-8, F1, F2, F4, F6).

const styles = path.resolve(__dirname, '../../../styles') + path.sep
const src = path.resolve(__dirname, '../../..') + path.sep
const css = (name: string) => readFileSync(styles + name, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const squash = (text: string) => text.replace(/\s+/g, ' ')
const body = (source: string, selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return source.match(new RegExp(`(?:^|\\n|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`))?.[1]
}

describe('KIT-1 Disclosure title: short titles stay whole, long titles wrap beside the chevron', () => {
  it('puts the title and meta in one label beside the chevron, so the title fits the label and never the whole trigger', () => {
    render(
      <Disclosure title="Attempt 1" meta="No weak spots · 1 suggestion">
        Body
      </Disclosure>,
    )
    const trigger = screen.getByRole('button', { name: /Attempt 1/ })
    const label = trigger.querySelector(':scope > .kit-disclosure__label') as HTMLElement
    expect(label).toBeTruthy()
    expect(label.querySelector(':scope > .kit-disclosure__title')?.textContent).toBe('Attempt 1')
    expect(label.querySelector(':scope > .kit-disclosure__meta')?.textContent).toBe('No weak spots · 1 suggestion')
    expect(trigger.querySelector(':scope > .kit-disclosure__chevron')).toBeTruthy()
  })

  it('lets the label shrink and wrap the meta under the title; the title keeps fit-content of the label only', () => {
    const source = css('kit/disclosure.css')
    const label = body(source, '.kit-disclosure__label')
    expect(label).toMatch(/flex:\s*1 1 auto/)
    expect(label).toMatch(/min-width:\s*0/)
    expect(label).toMatch(/flex-wrap:\s*wrap/)
    const title = body(source, '.kit-disclosure__title')
    expect(title).toMatch(/min-width:\s*fit-content/)
    expect(title).toMatch(/flex:\s*0 1 auto/)
    // The meta's basis is 0, so it only leaves the title's line when even its longest word does not fit there.
    expect(body(source, '.kit-disclosure__meta')).toMatch(/flex:\s*1 1 0%/)
  })

  it('shows a long-title row and a short-title, long-meta row in a 288px (320 phone) gallery specimen', () => {
    const { container } = render(<KitPage />)
    const specimen = container.querySelector('[data-specimen="disclosure-long-title"]') as HTMLElement
    expect(specimen.style.maxInlineSize).toBe('18rem')
    const titles = [...specimen.querySelectorAll('.kit-disclosure__title')].map((node) => node.textContent ?? '')
    expect(titles.some((title) => title.length > 60)).toBe(true)
    expect(titles).toContain('Attempt 1')
  })

  it('keeps a Count meta inside the label', () => {
    render(
      <Disclosure title="Document checks" meta={<Count value={3} />}>
        Body
      </Disclosure>,
    )
    expect(document.querySelector('.kit-disclosure__label > .kit-disclosure__meta .kit-count')).toBeTruthy()
  })
})

describe('KIT-2 empty-state sm actions take the md size only', () => {
  const state = squash(css('kit/state.css'))

  it('leaves shadow and movement to the variant, disabled and reduced-motion rules', () => {
    const sizeRule = state.match(
      /\.kit-empty:not\(\[data-size='inline'\]\) > \.kit-empty__action \.kit-button--sm:not\(\.kit-button--icon, \.kit-button--link\) \{([^}]*)\}/,
    )?.[1]
    expect(sizeRule).toMatch(/--kit-button-h:\s*var\(--kit-h-md\)/)
    expect(sizeRule).not.toMatch(/--kit-button-(shadow|lift|press|px)/)
  })

  it('gives the md shadow only to framed, enabled buttons, and the md movement only without reduced motion', () => {
    expect(state).toMatch(
      /\.kit-button--sm:not\(\.kit-button--icon, \.kit-button--link, \.kit-button--ghost\):not\(:disabled, \[data-disabled='true'\]\) \{[^}]*--kit-button-shadow:\s*var\(--sh-2\);/,
    )
    const motion = state.match(/@media \(prefers-reduced-motion: no-preference\) \{(.*?\})\s*\}/)?.[1]
    expect(motion).toMatch(/--kit-button-lift:\s*-2px/)
    expect(motion).toMatch(/--kit-button-press:\s*4px/)
    expect(motion).toMatch(/:not\(\.kit-button--icon, \.kit-button--link, \.kit-button--ghost\):not\(:disabled, \[data-disabled='true'\]\)/)
  })
})

describe('KIT-3 a disabled success checkbox is stone, not mint', () => {
  it('keeps the mint fill to enabled boxes', () => {
    const check = squash(css('kit/check.css'))
    expect(check).toContain(".kit-check[data-tone='success'] .kit-check__box:not(:disabled):is(:checked, :indeterminate) { background: var(--mint); }")
  })

  it('shows a disabled, checked success box in the gallery', () => {
    render(<KitPage />)
    const box = screen.getByLabelText('Sent thank-you note (locked)') as HTMLInputElement
    expect(box.disabled).toBe(true)
    expect(box.checked).toBe(true)
    expect(box.closest('.kit-check')?.getAttribute('data-tone')).toBe('success')
  })
})

describe('KIT-4 numeric table cells use tabular figures', () => {
  it('aligns every digit in a numeric column (STICKER 1.4)', () => {
    expect(body(css('kit/table.css'), ".kit-table__cell[data-numeric]")).toMatch(/font-variant-numeric:\s*var\(--numeric-tabular\)/)
  })
})

describe('KIT-5 actionsWrap={false} with a description on a phone', () => {
  it('keeps the actions beside the title: the phone stacking rules skip it', () => {
    const section = squash(css('kit/section.css'))
    const phone = section.slice(section.indexOf('@media (max-width: 639px)'))
    expect(phone).toContain(
      ".kit-section:not([data-actions-wrap='false']) > .kit-section__head:has(> .kit-section__description):has(> .kit-section__row > .kit-section__actions) > .kit-section__row { display: contents; }",
    )
    expect(phone).toContain(".kit-section:not([data-actions-wrap='false']) > .kit-section__head:has(> .kit-section__description) > .kit-section__row > .kit-section__actions {")
    expect(phone).toContain(".kit-section:not([data-actions-wrap='false']) > .kit-section__head:has(> .kit-section__row > .kit-section__actions) > .kit-section__description {")
  })
})

describe('KIT-8 gallery specimens for loadingLines and focusFieldOnOpen', () => {
  it('shows a loading table with two lines per text cell', () => {
    const { container } = render(<KitPage />)
    const specimen = container.querySelector('[data-specimen="table-loading-lines"]') as HTMLElement
    const cell = specimen.querySelector('.kit-table__cell[data-primary]') as HTMLElement
    expect(cell.querySelectorAll('.kit-skeleton').length).toBe(2)
  })

  it('has a dialog that opens on its first empty field through focusFieldOnOpen', () => {
    render(<KitPage />)
    expect(screen.getByText('Field-first dialog').closest('button')).toBeTruthy()
  })
})

describe('F6 an entry card heading is the kit Section (size xs, actionsWrap false), not page CSS', () => {
  it('drops the CV Studio overrides of the kit Section heading', () => {
    expect(css('cv-studio.css')).not.toMatch(/\.kit-section__(row|title|actions)/)
  })

  it('passes actionsWrap={false} on both entry card Sections in the desktop rail (the old override was rail-only)', () => {
    const editor = readFileSync(src + 'components/cv-studio/CvSectionEditor.tsx', 'utf8')
    expect(editor.match(/size="xs"\s+actionsWrap=\{!inline\}/g)?.length).toBe(2)
    expect(editor.match(/inline=\{inline\} \/>/g)?.length).toBe(2)
  })

  it('tops the tools on a wrapped xs title and sets them 4px apart under a mouse, in the kit', () => {
    const section = squash(css('kit/section.css'))
    expect(section).toContain(
      ".kit-section[data-size='xs'][data-actions-wrap='false'] > .kit-section__head > .kit-section__row { align-items: flex-start; }",
    )
    expect(section).toMatch(
      /@media \(pointer: fine\) \{ \.kit-section\[data-size='xs'\]\[data-actions-wrap='false'\] > \.kit-section__head > \.kit-section__row > \.kit-section__actions \{ gap: var\(--space-1\); \} \}/,
    )
  })

  it('shows the xs + actionsWrap={false} card heading in the gallery', () => {
    const { container } = render(<KitPage />)
    const specimen = container.querySelector('[data-specimen="section-xs-nowrap"]') as HTMLElement
    const section = specimen.querySelector('.kit-section') as HTMLElement
    expect(section.getAttribute('data-size')).toBe('xs')
    expect(section.getAttribute('data-actions-wrap')).toBe('false')
  })
})

describe('F1 the CV export moment sits over the cookie notice, under overlays', () => {
  it('has a notice layer between the banner and the overlays', () => {
    const theme = css('theme.css')
    const z = (name: string) => Number(theme.match(new RegExp(`--z-${name}:\\s*(\\d+)`))?.[1])
    expect(z('notice')).toBeGreaterThan(z('banner'))
    expect(z('notice')).toBeLessThan(z('overlay'))
    expect(body(css('cv-studio.css'), '.cvs-moment')).toMatch(/z-index:\s*var\(--z-notice\)/)
  })
})

describe('F2 focus never lands inside a scroll-edge fade', () => {
  it('pads each masked scroller by its fade', () => {
    expect(css('shell.css')).toMatch(/\.app-sidebar__content\s*\{[^}]*scroll-padding-block:\s*var\(--s7\)/)
    expect(css('applications.css')).toMatch(/\.camp-board\s*\{[^}]*scroll-padding-inline:\s*var\(--s8\)/)
    expect(css('profile.css')).toMatch(/\.profile-suggestions__list\s*\{[^}]*scroll-padding-block:\s*var\(--s7\) var\(--s8\)/)
  })
})

describe('F4 admin Runs by tool uses RowMeta placement="below"', () => {
  it('drops the page copy of the kit row grid', () => {
    const admin = css('admin.css')
    expect(admin).not.toMatch(/@container kit-list \(max-width: 30rem\)/)
    expect(admin).not.toMatch(/\.admin-tools \.kit-row__leading/)
    const page = readFileSync(src + 'pages/admin/admin-dashboard-page.tsx', 'utf8')
    expect(page).toMatch(/<RowMeta placement="below" className="admin-bar-col">/)
  })
})
