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
  it('gradients appear only where they are a functional cue: the Segmented overflow edge and 1px hairlines', () => {
    const allowed: Record<string, RegExp> = {
      'segmented.css': /functional overflow cue/,
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
