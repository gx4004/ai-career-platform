import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('styles.css self-hosts the two families before any rule', async () => {
  const css = await read('src/styles.css')
  const imports = css.match(/@import\s+'[^']+';/g) ?? []
  const bricolage = imports.indexOf("@import '@fontsource-variable/bricolage-grotesque/opsz.css';")
  const onest = imports.indexOf("@import '@fontsource-variable/onest/wght.css';")
  const theme = imports.indexOf("@import './styles/theme.css';")
  assert.notEqual(bricolage, -1, 'Bricolage Grotesque (wght + opsz) is imported')
  assert.notEqual(onest, -1, 'Onest (wght) is imported')
  assert.ok(bricolage < theme && onest < theme, 'font imports come before the app styles')
})

test('the root route requests no third-party font and preloads the two latin faces', async () => {
  const root = await read('src/routes/__root.tsx')
  assert.doesNotMatch(root, /https?:\/\/fonts\./)
  assert.doesNotMatch(root, /preconnect/)
  assert.match(root, /bricolage-grotesque-latin-opsz-normal\.woff2\?url/)
  assert.match(root, /onest-latin-wght-normal\.woff2\?url/)
  assert.match(root, /name: 'theme-color', content: '#f3f4f9'/)
})

test('the font packages are dependencies and the unused geist package is gone', async () => {
  const pkg = JSON.parse(await read('package.json'))
  assert.ok(pkg.dependencies['@fontsource-variable/bricolage-grotesque'])
  assert.ok(pkg.dependencies['@fontsource-variable/onest'])
  assert.equal(pkg.dependencies['@fontsource-variable/geist'], undefined)
})

test('tokens put the self-hosted faces first, with measured metric fallbacks behind them', async () => {
  const theme = await read('src/styles/theme.css')
  assert.match(theme, /--font-ui:\s*'Onest Variable',\s*'Onest Fallback'/)
  assert.match(theme, /--font-display:\s*'Bricolage Grotesque Variable',\s*'Bricolage Grotesque Fallback'/)
  assert.match(theme, /--font-sans:\s*var\(--font-ui\)/)

  const typography = await read('src/styles/typography.css')
  for (const family of ['Onest Fallback', 'Bricolage Grotesque Fallback']) {
    const faces = typography.match(new RegExp(`font-family:\\s*'${family}'`, 'g')) ?? []
    assert.ok(faces.length >= 1, `${family} is declared`)
  }
  assert.doesNotMatch(typography, /Instrument Sans|Newsreader/)
  const sizeAdjust = [...typography.matchAll(/size-adjust:\s*([\d.]+)%/g)].map((m) => Number(m[1]))
  assert.ok(sizeAdjust.length >= 2 && sizeAdjust.every((n) => n > 90 && n < 110), 'size-adjust values are sane')
})

test('the global h1..h6 rule does not set a font-family (the CV paper headings inherit it)', async () => {
  const typography = await read('src/styles/typography.css')
  const rule = typography.match(/h1,\s*h2,\s*h3,\s*h4,\s*h5,\s*h6\s*\{([^}]*)\}/)
  assert.ok(rule, 'global heading rule exists')
  assert.doesNotMatch(rule[1], /font-family/)
})
