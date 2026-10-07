import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = path.resolve(__dirname, '../../../styles/kit') + path.sep
const files = readdirSync(dir).filter((name) => name.endsWith('.css'))

const stripped = (name: string) => readFileSync(dir + name, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** Split a selector list on top-level commas (not the ones inside :is(...) or :not(...)). */
function splitList(prelude: string) {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of prelude) {
    if (char === '(') depth++
    if (char === ')') depth--
    if (char === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
    } else current += char
  }
  parts.push(current.trim())
  return parts
}

/** Every style-rule selector, skipping at-rules and keyframe steps. */
function selectors(css: string) {
  const out: string[] = []
  for (const match of css.matchAll(/([^{}]+)\{/g)) {
    const prelude = match[1].trim()
    if (prelude.startsWith('@') || /^(from|to|\d+%)(\s*,\s*(from|to|\d+%))*$/.test(prelude)) continue
    out.push(...splitList(prelude))
  }
  return out
}

describe('kit stylesheets follow the kit conventions', () => {
  it('finds the kit stylesheets', () => {
    expect(files).toEqual(expect.arrayContaining([
        'overlay.css',
        'dialog.css',
        'sheet.css',
        'menu.css',
        'toast.css',
        'tabs.css',
        'disclosure.css',
        'page.css',
        'meta.css',
        'section.css',
        'row.css',
        'table.css',
        'toolbar.css',
        'state.css',
        'skeleton.css',
        'radio.css',
        'file.css',
        'avatar.css',
      ]))
  })

  for (const name of files) {
    describe(name, () => {
      const css = stripped(name)

      it('has no !important, backdrop blur, or transition: all', () => {
        expect(css).not.toMatch(/!\s*important/)
        expect(css).not.toMatch(/backdrop-filter/)
        expect(css).not.toMatch(/transition:\s*all/)
      })

      it('has no literal colours: tokens only', () => {
        expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
        expect(css).not.toMatch(/\b(rgb|rgba|hsl|hsla|oklch)\(/)
      })

      it('has no uppercase transforms (no eyebrow labels)', () => {
        expect(css).not.toMatch(/text-transform:\s*uppercase/)
      })

      it('takes z-index from the --z-* scale (0, 1 and -1 for local stacking are fine)', () => {
        const values = [...css.matchAll(/z-index:\s*([^;]+);/g)].map((match) => match[1].trim())
        for (const value of values) expect(value).toMatch(/^(var\(--z-[a-z]+\)|-?[01])$/)
      })

      it('stops its animations and transform transitions under prefers-reduced-motion', () => {
        const moves = /(^|[;{\s])animation(-name)?:\s*(?!none)[\w-]|transition:[^;]*\btransform\b/.test(css)
        if (!moves) return
        const reduced = [...css.matchAll(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?\n\})/g)].map((match) => match[1]).join('\n')
        expect(reduced).toMatch(/animation:\s*none|animation-duration|transition:\s*none|transition-duration/)
      })

      it('prefixes every rule with a kit- class (or is a :root token block)', () => {
        const offenders = selectors(css).filter((selector) => !/\.kit-/.test(selector) && !selector.startsWith(':root'))
        expect(offenders).toEqual([])
      })
    })
  }
})

describe('skeleton.css is calm', () => {
  const css = stripped('skeleton.css')

  it('animates opacity only: no sweep, no transform, no gradient moving across', () => {
    const keyframes = [...css.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?\n\})\s*\n/g)]
    expect(keyframes.map((match) => match[1])).toEqual(['kit-skeleton-pulse'])
    const body = keyframes[0][2]
    expect(body).toMatch(/opacity/)
    expect(body).not.toMatch(/transform|translate|background|gradient/)
    expect(css).not.toMatch(/shimmer/)
  })

  it('has no animation at all under reduced motion', () => {
    const reduced = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?\n\})/)
    expect(reduced).toBeTruthy()
    expect(reduced![1]).toMatch(/animation:\s*none/)
  })

  it('pulses slowly (two seconds or more)', () => {
    const duration = css.match(/animation:\s*kit-skeleton-pulse\s+([\d.]+)s/)
    expect(duration).toBeTruthy()
    expect(Number(duration![1])).toBeGreaterThanOrEqual(1)
  })
})

describe('functional-only CSS exceptions', () => {
  it('gradients appear only where they are a functional cue: the Segmented, JumpNav and stacked Table sort-strip overflow edges and 1px hairlines', () => {
    const allowed: Record<string, RegExp> = {
      'segmented.css': /functional overflow cue/,
      'jump-nav.css': /functional overflow cue/,
      // consistency-F26: the stacked Table's sort strip draws the same edge cue.
      'table.css': /functional overflow cue/,
      'row.css': /hairline/,
      'skeleton.css': /hairline|1px/,
    }
    for (const name of files) {
      const raw = readFileSync(dir + name, 'utf8')
      const code = stripped(name)
      if (!/gradient\(/.test(code)) continue
      expect(Object.keys(allowed), `${name} uses a gradient`).toContain(name)
      expect(raw, `${name} must say why its gradient is functional`).toMatch(allowed[name])
    }
  })
})

describe('Button sizing never squeezes a label', () => {
  const css = stripped('button.css')

  it('does not use overflow-wrap: anywhere on a button (it lowers min-content to one letter: "Save / chang / es")', () => {
    for (const name of files) {
      for (const rule of stripped(name).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (/\.kit-button/.test(rule[1])) expect(rule[2], `${name}: ${rule[1].trim()}`).not.toMatch(/overflow-wrap:\s*anywhere|word-break:\s*break-all/)
      }
    }
  })

  it('has a natural width (fit-content) capped at the column, and wraps at word boundaries', () => {
    const base = css.match(/\.kit-button\s*\{([^}]*)\}/)![1]
    expect(base).toMatch(/inline-size:\s*fit-content/)
    expect(base).toMatch(/max-inline-size:\s*100%/)
    expect(base).toMatch(/overflow-wrap:\s*break-word/)
  })

  it('gates every hover rule in the touch-sensitive families behind (hover: hover)', () => {
    for (const name of ['button.css', 'control.css', 'segmented.css', 'check.css', 'radio.css', 'tabs.css', 'table.css', 'row.css', 'section.css', 'disclosure.css']) {
      const code = stripped(name)
      // Walk every ":hover" and require an enclosing @media (hover: hover) block.
      for (const match of code.matchAll(/:hover/g)) {
        const before = code.slice(0, match.index)
        const open = before.lastIndexOf('@media (hover: hover)')
        expect(open, `${name}: a :hover rule outside @media (hover: hover) near "${code.slice(Math.max(0, match.index! - 60), match.index! + 20).trim()}"`).toBeGreaterThanOrEqual(0)
        const between = before.slice(open)
        const depth = (between.match(/\{/g) ?? []).length - (between.match(/\}/g) ?? []).length
        expect(depth, `${name}: :hover outside its @media block near "${code.slice(Math.max(0, match.index! - 60), match.index! + 20).trim()}"`).toBeGreaterThanOrEqual(1)
      }
    }
  })
})

describe('row.css numbering and phone rule', () => {
  const css = stripped('row.css')

  it('increments the counter on the row itself: the List is a size container and its style containment would restart a counter incremented in ::before', () => {
    expect(css).toMatch(/\.kit-list\[data-numbered\]\s*>\s*\.kit-row\s*\{\s*counter-increment:\s*kit-row/)
    expect(css).not.toMatch(/::before\s*\{[^}]*counter-increment/)
  })

  it('decides the phone layout from the List width (container query), not from a media query or row content', () => {
    expect(css).toMatch(/\.kit-list\s*\{[^}]*container:\s*kit-list\s*\/\s*inline-size/)
    expect(css).toMatch(/@container kit-list \(max-width: 31\.9375rem\)/)
  })
})

describe('control.css trailing button', () => {
  const css = stripped('control.css')

  it('lifts the button 100% width cap inside an adornment: the negative end margin would otherwise squeeze a 44px touch icon button to 32px', () => {
    expect(css).toMatch(/\.kit-input__adornment\s*>\s*\.kit-button\s*\{\s*max-inline-size:\s*none/)
  })
})

describe('invalid choice controls (account-admin-F05)', () => {
  it('keep the 2px ink outline and mark the error with a rose-soft fill, never a second crimson ring', () => {
    const check = stripped('check.css')
    const radio = stripped('radio.css')
    for (const source of [check, radio]) {
      expect(source).not.toMatch(/\[data-invalid\][^{]*\{[^}]*outline:\s*var\(--bw\) solid var\(--danger-ink\)/)
    }
    expect(check).toMatch(
      /\.kit-check\[data-invalid\] \.kit-check__box:not\(:checked, :indeterminate, :disabled\),\s*\.kit-check\[data-invalid\] \.kit-check__switch:not\(:checked, :disabled\) \{\s*background:\s*var\(--rose-soft\);/,
    )
    expect(radio).toMatch(/\.kit-radio\[data-invalid\] \.kit-radio__input:not\(:checked, :disabled\) \{\s*background:\s*var\(--rose-soft\);/)
  })
})

describe('pagination numerals (account-admin-F06)', () => {
  it('sets the summary and status as running text (proportional) and keeps tabular figures on the page buttons', () => {
    const source = stripped('toolbar.css')
    const text = source.match(/\.kit-pagination__summary,\s*\.kit-pagination__status \{([^}]*)\}/)
    expect(text?.[1]).toMatch(/font-variant-numeric:\s*proportional-nums/)
    expect(source).not.toMatch(/\.kit-pagination__(summary|status)[^{]*\{[^}]*numeric-tabular/)
    expect(source.match(/\.kit-pagination__page \{([^}]*)\}/)?.[1]).toMatch(/font-variant-numeric:\s*var\(--numeric-tabular\)/)
  })
})

describe('table numerals (account-admin-AA-F06)', () => {
  it('sets numeric cells in tabular figures, end-aligned, so tens line up under tens (STICKER 1.4, KIT-4)', () => {
    const source = stripped('table.css')
    const numeric = source.match(/\.kit-table__cell\[data-numeric\] \{([^}]*)\}/)?.[1]
    expect(numeric).toMatch(/font-variant-numeric:\s*var\(--numeric-tabular\)/)
    // Prose cells stay proportional; only the numeric flag opts in.
    expect(source.match(/\.kit-table \{([^}]*)\}/)?.[1] ?? source).not.toMatch(/numeric-tabular/)
    expect(source.match(/\.kit-table__cell\[data-align='end'\] \{([^}]*)\}/)?.[1]).toMatch(/text-align:\s*end/)
  })
})

describe('toolbar search floor (account-admin-F18)', () => {
  it('never lets the search shrink below 12rem beside wide filters (they wrap instead), and spaces the clear link', () => {
    const source = stripped('toolbar.css')
    expect(source.match(/\.kit-toolbar__search \{([^}]*)\}/)?.[1]).toMatch(/min-width:\s*min\(100%, 12rem\)/)
    expect(source.match(/\.kit-toolbar__clear \{([^}]*)\}/)?.[1]).toMatch(/margin-inline-start:\s*var\(--s1\)/)
    // Phones keep the search beside the one Filters button (no floor there, or the button would wrap).
    const phone = source.match(/@media \(max-width: 767px\) \{\s*\.kit-toolbar__search \{([^}]*)\}/)
    expect(phone?.[1]).toMatch(/min-width:\s*0/)
  })
})

describe('sm Section title rank (account-admin-F21)', () => {
  it('sets the sm title in the display face, a clear step above 14px field labels and below the 24px section heading', () => {
    const source = stripped('section.css')
    const sm = source.match(/\.kit-section\[data-size='sm'\] > \.kit-section__head \.kit-section__title \{([^}]*)\}/)?.[1]
    expect(sm).toMatch(/font-family:\s*var\(--font-display\)/)
    expect(sm).toMatch(/font-weight:\s*var\(--fw-black\)/)
    // 20px (--fs-title): between the field label (0.875rem) and --fs-section (24px, 22px on narrow screens). Was 19px
    // (--fs-body-l), off the heading scale beside the 20px panel titles (consistency-F04).
    expect(sm).toMatch(/font-size:\s*var\(--fs-title\)/)
  })
})

describe('round skeleton block (account-admin-F20)', () => {
  it('rounds a circle block fully, so an avatar placeholder has the avatar shape', () => {
    const source = stripped('skeleton.css')
    const circle = source.match(/\.kit-skeleton--block\[data-shape='circle'\] > \.kit-skeleton__bar \{([^}]*)\}/)?.[1]
    expect(circle).toMatch(/border-radius:\s*var\(--r-pill\)/)
  })
})

describe('phone Filters button at 320 (account-admin-F22)', () => {
  it('drops the Filters word under 360px so the search beside it keeps room for its placeholder', () => {
    const source = stripped('toolbar.css')
    const narrow = source.match(/@media \(max-width: 359px\) \{([\s\S]*?)\n\}/g)?.join('\n') ?? ''
    expect(narrow).toMatch(/\.kit-toolbar__filters-word \{\s*display:\s*none;/)
  })
})

describe('match-row skeleton on a narrow List (consistency-F15)', () => {
  it('sets the stamp 12px from the text, as the loaded match rows on Discover and the dashboard do', () => {
    const source = stripped('skeleton.css')
    const narrow = [...source.matchAll(/@container kit-list \(max-width: 31\.9375rem\) \{([\s\S]*?)\n\}/g)].map((m) => m[1]).join('\n')
    const rule = narrow.match(/\.kit-skeleton__row:has\(> \.kit-skeleton__leading--stamp\)\s*\{([^}]*)\}/)?.[1]
    expect(rule).toMatch(/column-gap:\s*var\(--s3\)/)
  })
})

describe('inline empty state is a sentence (cv-studio-F11)', () => {
  it('wraps its line as running text (pretty, not balanced) and sits flush with the content above (no inline padding)', () => {
    const source = stripped('state.css')
    const title = source.match(/\.kit-empty\[data-size='inline'\] \.kit-empty__title \{([^}]*)\}/)?.[1]
    expect(title).toMatch(/text-wrap:\s*pretty/)
    const box = source.match(/\.kit-empty\[data-size='inline'\] \{([^}]*)\}/)?.[1]
    expect(box).toMatch(/padding:\s*var\(--space-1\) 0;/)
  })
})

describe('empty-state action size (consistency-F02)', () => {
  it('sets an sm button inside a framed or page empty state to the md metrics; an inline slot keeps sm', () => {
    const source = stripped('state.css')
    const rule = source.match(
      /\.kit-empty:not\(\[data-size='inline'\]\) > \.kit-empty__action \.kit-button--sm:not\(\.kit-button--icon, \.kit-button--link\) \{([^}]*)\}/,
    )?.[1]
    expect(rule).toMatch(/--kit-button-h:\s*var\(--kit-h-md\)/)
    expect(rule).toMatch(/--kit-button-fs:\s*var\(--fs-body\)/)
    expect(rule).toMatch(/--kit-button-radius:\s*var\(--r-md\)/)
    // The md shadow goes only to framed, enabled buttons (KIT-2: a ghost or disabled action keeps none).
    expect(source).toMatch(
      /\.kit-button--sm:not\(\.kit-button--icon, \.kit-button--link, \.kit-button--ghost\):not\(:disabled, \[data-disabled='true'\]\) \{[^}]*--kit-button-shadow:\s*var\(--sh-2\)/,
    )
  })
})

describe('row reveal while loading (applications-discovery-F30)', () => {
  // A deep match started from a row's … menu: the menu closes at once and the trigger shows the spinner. On a hover
  // device the revealed actions hid again as soon as the pointer left, taking the only pending sign with them.
  it('keeps revealed row actions in view while one of their controls is loading', () => {
    const css = stripped('row.css').replace(/\s+/g, ' ')
    expect(css).toContain(".kit-row__reveal:has([data-state='open'], [aria-expanded='true'], [data-loading='true']) { opacity: 1; }")
    expect(css).toContain(".kit-row__actions[data-reveal]:has([data-state='open'], [aria-expanded='true'], [data-loading='true']) { opacity: 1; }")
  })
})

describe('toasts beside an open drawer (applications-discovery-F38)', () => {
  // Hide a job, open Hidden jobs: on tablet and desktop the toast sat bottom-right on top of the drawer's Restore rows.
  it('moves the toast region left of an open right-hand drawer, sized per drawer width, from 768px up', () => {
    const css = stripped('toast.css').replace(/\s+/g, ' ')
    const wide = css.match(/@media \(min-width: 768px\) \{(.*?)\} \}/)?.[1] ?? ''
    expect(wide).toContain(":root:has(.kit-sheet:is([data-side='right'], [data-side='responsive'])[data-state='open']) .kit-toast-region { --kit-toast-beside: min(30rem, 100vw); right: calc(var(--kit-toast-beside) + var(--s4)); width: min(24rem, calc(100vw - var(--kit-toast-beside) - var(--s4) * 2));")
    expect(wide).toContain("[data-size='sm'][data-state='open']) .kit-toast-region { --kit-toast-beside: min(24rem, 100vw);")
    expect(wide).toContain("[data-size='lg'][data-state='open']) .kit-toast-region { --kit-toast-beside: min(36rem, 100vw);")
    // The widths it mirrors.
    const sheet = stripped('sheet.css').replace(/\s+/g, ' ')
    expect(sheet).toContain('.kit-sheet { --kit-sheet-w: 30rem;')
    expect(sheet).toContain(".kit-sheet[data-size='sm'] { --kit-sheet-w: 24rem; }")
    expect(sheet).toContain(".kit-sheet[data-size='lg'] { --kit-sheet-w: 36rem; }")
  })
})

