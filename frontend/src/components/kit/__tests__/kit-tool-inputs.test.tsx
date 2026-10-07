import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Button, FileInput, List, Notice, Row, RowBody, RowTitle, Split } from '#/components/kit'

/** Kit additions from the tool-input sign-off (round 2): each is a prop, a variant or a phone rule with a gallery specimen. */

const css = (name: string) =>
  readFileSync(path.resolve(__dirname, '../../../styles/kit', name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

describe('Row overflow="clamp"', () => {
  it('records the mode on the row', () => {
    render(
      <List aria-label="Runs">
        <Row overflow="clamp">
          <RowBody>
            <RowTitle>Staff Backend Engineer at Northwind Labs, second pass with the tailored resume</RowTitle>
          </RowBody>
        </Row>
      </List>,
    )
    expect(screen.getByRole('listitem').getAttribute('data-overflow')).toBe('clamp')
  })

  it('wraps the title to two lines at most and keeps the subtitle on one', () => {
    const row = css('row.css')
    expect(row).toMatch(/\.kit-row\[data-overflow='clamp'\] \.kit-row__title\s*\{[^}]*-webkit-line-clamp:\s*2/)
    expect(row).toMatch(/\.kit-row\[data-overflow='clamp'\] \.kit-row__subtitle\s*\{[^}]*white-space:\s*nowrap/)
  })
})

describe('Split breakpoint="compact"', () => {
  it('marks the split and goes side by side from 52rem (the default stays 56rem)', () => {
    const { container, rerender } = render(
      <Split rail={<p>rail</p>} railLabel="Summary" breakpoint="compact">
        <p>main</p>
      </Split>,
    )
    expect(container.querySelector('.kit-split')?.getAttribute('data-breakpoint')).toBe('compact')
    rerender(
      <Split rail={<p>rail</p>} railLabel="Summary">
        <p>main</p>
      </Split>,
    )
    expect(container.querySelector('.kit-split')?.hasAttribute('data-breakpoint')).toBe(false)
    const page = css('page.css')
    expect(page).toMatch(/@container kit-split \(min-width: 56rem\)/)
    expect(page).toMatch(
      /@container kit-split \(min-width: 52rem\)\s*\{\s*\.kit-split\[data-breakpoint='compact'\] \.kit-split__layout\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\) var\(--kit-rail-w\)/,
    )
  })
})

describe('Notice actionPlacement="below"', () => {
  it('marks the notice and keeps the default (beside the text) unmarked', () => {
    const { container, rerender } = render(
      <Notice
        title="Imported the posting"
        actionPlacement="below"
        action={
          <>
            <Button size="sm" variant="secondary">Replace</Button>
            <Button size="sm" variant="ghost">Keep mine</Button>
          </>
        }
      >
        Your description already has text.
      </Notice>,
    )
    const notice = container.querySelector('.kit-notice')!
    expect(notice.getAttribute('data-action-placement')).toBe('below')
    expect(notice.querySelectorAll('.kit-notice__action button')).toHaveLength(2)
    rerender(<Notice action={<Button size="sm">Undo</Button>}>Filled.</Notice>)
    expect(container.querySelector('.kit-notice')!.hasAttribute('data-action-placement')).toBe(false)
  })

  it('puts the choice on its own line under the text, aligned with it, and spans the notice under 480px', () => {
    const section = css('section.css')
    expect(section).toMatch(/\.kit-notice\[data-action-placement='below'\]\s*\{\s*flex-wrap:\s*wrap/)
    expect(section).toMatch(
      /\.kit-notice\[data-action-placement='below'\] \.kit-notice__action\s*\{[^}]*flex-basis:\s*100%[^}]*gap:\s*var\(--space-2\)/,
    )
    expect(section).toMatch(
      /\.kit-notice\[data-action-placement='below'\] \.kit-notice__icon ~ \.kit-notice__action\s*\{\s*padding-inline-start:\s*calc\(1\.25rem \+ var\(--space-3\)\)/,
    )
    expect(section).toMatch(
      /@media \(max-width: 479px\)\s*\{[^@]*\.kit-notice\[data-action-placement='below'\] \.kit-notice__icon ~ \.kit-notice__action\s*\{\s*padding-inline-start:\s*0/,
    )
  })
})

describe('phone rules', () => {
  it('Button lg drops to 20px sides under 360px, so a page’s one big label keeps one line in a 252px column', () => {
    expect(css('button.css')).toMatch(/@media \(max-width: 359px\)\s*\{\s*\.kit-button--lg\s*\{\s*--kit-button-px:\s*var\(--s5\)/)
  })

  it('Notice keeps a usable text column on the narrowest phones (12px padding, 8px to the icon under 360px)', () => {
    expect(css('section.css')).toMatch(/@media \(max-width: 359px\)\s*\{\s*\.kit-notice\s*\{\s*gap:\s*var\(--space-2\);\s*padding:\s*var\(--s3\)/)
  })

  it('PageHeader puts its mark beside the title, not halfway down a wrapped lead, under 480px', () => {
    expect(css('page.css')).toMatch(/@media \(max-width: 479px\)\s*\{\s*\.kit-page-header__identity\s*\{\s*align-items:\s*flex-start/)
  })
})

describe('FileInput dropzone: the whole area is the target', () => {
  const click = vi.spyOn(HTMLInputElement.prototype, 'click')

  afterEach(() => click.mockClear())

  it('opens the picker from a click anywhere on the area (the hint, the disc, the dashed space)', () => {
    const { container } = render(<FileInput variant="dropzone" icon={<svg />} aria-label="Resume" hint="PDF or DOCX, up to 10 MB" />)
    fireEvent.click(screen.getByText('PDF or DOCX, up to 10 MB'))
    expect(click).toHaveBeenCalledTimes(1)
    fireEvent.click(container.querySelector('.kit-file')!)
    expect(click).toHaveBeenCalledTimes(2)
    fireEvent.click(container.querySelector('.kit-file__icon')!)
    expect(click).toHaveBeenCalledTimes(3)
  })

  it('leaves the trigger to its native label behaviour (no second picker) and the remove button alone', () => {
    const { container } = render(<FileInput variant="dropzone" aria-label="Resume" />)
    fireEvent.click(container.querySelector('.kit-file__trigger')!)
    // The label's own activation is the browser's; the area must not open a second picker on top of it.
    expect(click).not.toHaveBeenCalled()
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'cv.pdf', { type: 'application/pdf' })] } })
    click.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Remove file' }))
    expect(click).not.toHaveBeenCalled()
  })

  it('does nothing when disabled, and the inline variant keeps only its trigger', () => {
    const disabled = render(<FileInput variant="dropzone" aria-label="Resume" disabled hint="hint" />)
    fireEvent.click(screen.getByText('hint'))
    expect(click).not.toHaveBeenCalled()
    disabled.unmount()
    render(<FileInput aria-label="Resume" hint="inline hint" />)
    fireEvent.click(screen.getByText('inline hint'))
    expect(click).not.toHaveBeenCalled()
  })

  it('shows a pointer over the area', () => {
    expect(css('file.css')).toMatch(/\.kit-file\[data-variant='dropzone'\]:not\(\[data-disabled\]\)\s*\{\s*cursor:\s*pointer/)
  })
})
