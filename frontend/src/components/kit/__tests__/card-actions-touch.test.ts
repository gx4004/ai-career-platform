import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(path.resolve(__dirname, '../../../styles/kit/section.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** The body of the first `@media <query>` block (one level of nested rules). */
function mediaBlock(query: string) {
  const start = css.indexOf(`@media ${query}`)
  if (start < 0) return null
  let depth = 0
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++
    if (css[i] === '}' && --depth === 0) return { start, body: css.slice(start, i + 1) }
  }
  return null
}

describe('CardActions on touch (T23)', () => {
  it('shows revealed card actions on any coarse pointer, after the hover-only hiding rule', () => {
    const touch = mediaBlock('(any-pointer: coarse)')
    const hover = mediaBlock('(hover: hover) and (pointer: fine)')
    expect(touch).not.toBeNull()
    expect(hover).not.toBeNull()
    expect(touch!.start).toBeGreaterThan(hover!.start)
    expect(touch!.body).toMatch(/\.kit-card__actions\[data-reveal\]\s*\{\s*opacity:\s*1/)
  })

  it('puts an overlay back in the title row there, so it never covers the card text', () => {
    const touch = mediaBlock('(any-pointer: coarse)')!.body
    expect(touch).toMatch(/\.kit-card__actions\[data-placement='overlay'\]\[data-reveal\]\s*\{[^}]*position:\s*relative/)
  })
})
