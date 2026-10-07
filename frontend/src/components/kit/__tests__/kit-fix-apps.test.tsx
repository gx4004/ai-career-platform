import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Checkbox, Disclosure, Input, Select, Switch, Toolbar } from '#/components/kit'

const dir = path.resolve(__dirname, '../../../styles') + path.sep
const css = (name: string) => readFileSync(dir + name, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** Split on top-level commas only. */
function splitArgs(list: string) {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of list) {
    if (char === '(') depth++
    if (char === ')') depth--
    if (char === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else current += char
  }
  parts.push(current)
  return parts
}

/** Selector specificity [ids, classes, types] for the selectors the kit writes (:is/:has/:not take their heaviest argument, :where adds nothing). */
function specificity(selector: string): [number, number, number] {
  let rest = selector
  const total: [number, number, number] = [0, 0, 0]
  const add = (value: [number, number, number]) => value.forEach((part, index) => (total[index] += part))
  for (;;) {
    const match = rest.match(/:(is|has|not|where)\(/)
    if (!match || match.index === undefined) break
    let depth = 1
    let end = match.index + match[0].length
    while (depth > 0) {
      if (rest[end] === '(') depth++
      if (rest[end] === ')') depth--
      end++
    }
    const inner = rest.slice(match.index + match[0].length, end - 1)
    if (match[1] !== 'where') {
      const heaviest = splitArgs(inner)
        .map((arg) => specificity(arg.replace(/^\s*[>+~]/, '')))
        .sort((a, b) => b[0] - a[0] || b[1] - a[1] || b[2] - a[2])[0]
      add(heaviest)
    }
    rest = rest.slice(0, match.index) + ' ' + rest.slice(end)
  }
  add([
    (rest.match(/#[\w-]+/g) ?? []).length,
    (rest.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) ?? []).length,
    (rest.match(/(^|[\s>+~])[a-z][\w-]*/gi) ?? []).length,
  ])
  return total
}

describe('kit row phone grid', () => {
  it('keeps the weight of `.kit-row:has(> .kit-row__actions)`, so a page placement with one more class wins', () => {
    const source = css('kit/row.css')
    const grid = source.match(/([^{}]+)\{\s*display:\s*grid;\s*grid-template-columns:\s*auto auto minmax\(0, 1fr\) auto;/)
    expect(grid).toBeTruthy()
    expect(specificity(grid![1].trim())).toEqual([0, 2, 0])
    // Discover's match row (one class more) outweighs it: the phone tally sits under the title, not the stamp.
    expect(specificity('.kit-row.disc-row:has(> .kit-row__actions)')).toEqual([0, 3, 0])
  })

  it('weighs selectors as the browser does', () => {
    expect(specificity(".kit-row:is(:has(> .a), :has(> .b[data-x='1']))")).toEqual([0, 3, 0])
    expect(specificity(".kit-row:is(:has(> .a), :has(> :where(.b[data-x='1'])))")).toEqual([0, 2, 0])
  })
})

describe('toasts and bottom sheets', () => {
  // Sign-off r2 (history-profile-F03): the same rule now also covers an open dialog (a toast sat on its Cancel button),
  // so the selector lists the dialog beside the bottom sheet.
  it('moves the toasts to the top edge while a bottom sheet or a dialog is open on a phone', () => {
    const source = css('kit/toast.css')
    const rule = source.match(/:root:has\(:is\(\.kit-sheet:is\(\[data-side='bottom'\], \[data-side='responsive'\]\), \.kit-dialog\)\[data-state='open'\]\) \.kit-toast-region \{([^}]*)\}/)
    expect(rule).toBeTruthy()
    expect(rule![1]).toMatch(/top:\s*calc\(var\(--s4\)/)
    expect(rule![1]).toMatch(/bottom:\s*auto/)
  })

  it('centres a phone dialog below the toasts while they are up, never under them', () => {
    const source = css('kit/dialog.css')
    const phone = source.match(/@media \(max-width: 767px\) \{\s*:root:has\(\.kit-toast-region \.kit-toast\) \.kit-dialog \{([^}]*)\}/)
    expect(phone).toBeTruthy()
    expect(phone![1]).toMatch(/inset-block-start:\s*calc\(var\(--kit-toast-stack, 0px\)/)
    expect(phone![1]).toMatch(/max-height:\s*calc\(100dvh - var\(--kit-toast-stack, 0px\)/)
  })
})

describe('MetaRow with a link or a badge in it', () => {
  // Sign-off r2 (history-profile-F05): under a coarse pointer a link-variant Button was 44px tall inside the meta line,
  // and the dot before it sat at the top of that 44px item, above the text.
  it('centres the dot on the item, and keeps a link-variant Button at the line height with a 44px target around it', () => {
    const source = css('kit/meta.css')
    const dot = source.match(/\.kit-meta__item \+ \.kit-meta__item::before \{([^}]*)\}/)
    expect(dot![1]).toMatch(/display:\s*flex/)
    expect(dot![1]).toMatch(/align-items:\s*center/)
    const link = source.match(/\.kit-meta__item > \.kit-button--link \{([^}]*)\}/)
    expect(link![1]).toMatch(/line-height:\s*inherit/)
    const coarse = source.match(/@media \(pointer: coarse\) \{([\s\S]*?)\n\}/)
    expect(coarse![1]).toMatch(/\.kit-meta__item > \.kit-button--link \{\s*min-height:\s*0;/)
    expect(coarse![1]).toMatch(/\.kit-meta__item > :is\(a, \.kit-button--link\)::after \{[^}]*inset-block:\s*min\(0px, calc\(50% - var\(--touch-target\) \/ 2\)\)/)
  })
})

describe('controls', () => {
  it('never inherit the tracking of a heading they sit in', () => {
    const base = css('kit/control.css').match(/\.kit-input,\s*\.kit-select,\s*\.kit-textarea,\s*\.kit-check\[data-framed\]\s*\{([^}]*)\}/)
    expect(base).toBeTruthy()
    expect(base![1]).toMatch(/letter-spacing:\s*normal/)
    expect(base![1]).toMatch(/font-family:\s*var\(--font-ui\)/)
  })
})

describe('dialog and sheet footers on narrow phones', () => {
  // Sign-off r2 (account-admin-F01) replaced the <=399px wrap-reverse rule: wrapping still stacked two right-aligned
  // buttons of different widths at 375-479px. A footer of buttons now stacks them full width. Sign-off consistency-F21
  // turned column-reverse into column: the stack follows the DOM (Cancel, then the primary at the bottom), so visual,
  // Tab and page-header orders agree.
  it('stack a footer of buttons full width under 480px, in DOM order with the primary (last) at the bottom', () => {
    const narrow = css('kit/overlay.css').match(/@media \(max-width: 479px\) \{([\s\S]*?)\n\}/)
    expect(narrow).toBeTruthy()
    // The footer's phoneLayout="row" option (a stepper's Back and Continue) is excluded from the stack, so the selector
    // carries :not([data-phone-layout='row']) since that prop landed.
    expect(narrow![1]).toMatch(/\.kit-panel__footer:not\(\[data-phone-layout='row'\]\):not\(:has\(> :not\(\.kit-button\)\)\) \{\s*flex-direction:\s*column;\s*align-items:\s*stretch;/)
    expect(narrow![1]).toMatch(/\.kit-panel__footer:not\(\[data-phone-layout='row'\]\):not\(:has\(> :not\(\.kit-button\)\)\) > \.kit-button \{\s*inline-size:\s*100%;/)
  })

  it('draw one 2px rule between a header and a footer with no body between them', () => {
    const rule = css('kit/overlay.css').match(/\.kit-panel__header \+ \.kit-panel__footer \{([^}]*)\}/)
    expect(rule).toBeTruthy()
    expect(rule![1]).toMatch(/border-top:\s*0/)
  })
})

describe('Checkbox tone', () => {
  it('fills mint for tone="success" and keeps the tangerine default otherwise', () => {
    render(
      <>
        <Checkbox label="Done task" tone="success" defaultChecked />
        <Checkbox label="Choice" defaultChecked />
        <Switch label="Setting" />
      </>,
    )
    expect(screen.getByRole('checkbox', { name: 'Done task' }).closest('.kit-check')?.getAttribute('data-tone')).toBe('success')
    expect(screen.getByRole('checkbox', { name: 'Choice' }).closest('.kit-check')?.hasAttribute('data-tone')).toBe(false)
    expect(screen.getByRole('switch', { name: 'Setting' }).closest('.kit-check')?.hasAttribute('data-tone')).toBe(false)
    // Enabled boxes only: a disabled one stays stone (KIT-3).
    expect(css('kit/check.css')).toMatch(/\.kit-check\[data-tone='success'\] \.kit-check__box:not\(:disabled\):is\(:checked, :indeterminate\) \{\s*background:\s*var\(--mint\);/)
  })
})

describe('Disclosure size', () => {
  it('lg gives a section row the PanelHeader title face', () => {
    const { container } = render(
      <>
        <Disclosure title="What's working" size="lg">Body</Disclosure>
        <Disclosure title="Plain">Body</Disclosure>
      </>,
    )
    const [large, plain] = Array.from(container.querySelectorAll('.kit-disclosure'))
    expect(large.getAttribute('data-size')).toBe('lg')
    expect(plain.hasAttribute('data-size')).toBe(false)
    const rule = css('kit/disclosure.css').match(/\.kit-disclosure--section\[data-size='lg'\] \.kit-disclosure__trigger \{([^}]*)\}/)
    expect(rule![1]).toMatch(/font-family:\s*var\(--font-display\)/)
    expect(rule![1]).toMatch(/font-size:\s*var\(--fs-title\)/)
  })
})

describe('Toolbar Filters sheet', () => {
  it('focuses the sheet, not its first field (a focused field raises the phone keyboard over the sheet)', async () => {
    render(
      <Toolbar
        search={<Input type="search" aria-label="Search jobs" />}
        filters={<Input aria-label="Location" />}
        sort={<Select aria-label="Sort" defaultValue="best"><option value="best">Best fit</option></Select>}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    const dialog = await screen.findByRole('dialog', { name: 'Filters' })
    await waitFor(() => expect(document.activeElement).toBe(dialog))
  })
})
