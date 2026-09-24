import { expect, test, type Page } from '@playwright/test'
import { uniqueEmail } from './helpers/identity'

/**
 * R9 control journey (issue #126).
 *
 * The R9 seam is that the *server* decides what a request may receive and the
 * browser only renders that decision (ADR 0003, D-048). The committed default is
 * the control condition: every result is delivered in full, with no gate, no
 * truncation, no upsell, and no ad placeholder — and the client-side ad gate plus
 * its `ad-unlocked` sessionStorage contract were deliberately removed (R9 #127,
 * D-051). Unit tests cover the decision object on both sides of the wire; nothing
 * asserted the delivered journey in a real browser until this file.
 *
 * The two things asserted here that no unit test can:
 *   1. the server's `access_decision` reaches the client on every delivery surface
 *      the browser touches (live run, saved detail, history list), and
 *   2. the rendered page delivers the *whole* payload — every issue the server
 *      returned, un-dimmed, un-clipped, and not covered by an overlay.
 *
 * Policy posture: `RESULT_ACCESS_POLICY_ENABLED` defaults to false, so the
 * decision's reason is `policy_disabled`. The enabled-but-full-access variant
 * (identical decision, reason `no_candidate_selected`) is deliberately NOT
 * exercised here: the E2E backend is `backend/tests/e2e_server.py`, which
 * documents that it "exposes no runtime switch or HTTP control surface", and the
 * only other way in would be to edit a committed default (`app/config.py`,
 * `backend/.env.example`, or the Playwright webServer env). Backend
 * `tests/test_result_access.py` parametrizes both postures instead.
 */
const CONTROL_DECISION = {
  state: 'full',
  treatment: 'control',
  reason: 'policy_disabled',
  can_export: true,
  policy_version: 'control-v1',
} as const

const apiUrl = `http://127.0.0.1:${process.env.E2E_BACKEND_PORT ?? '8000'}/api/v1`
const password = 'correct-horse-battery-staple'

/**
 * Deterministic against the E2E provider stub: the stubbed LLM returns `{}`, so
 * Resume Analyzer falls back to heuristic issues. This text has no Education
 * section, 100 words, and 3 bullet lines, which yields three heuristic issues
 * (completeness, clarity, structure) and two strengths — enough content for the
 * parity assertions to detect a truncated render.
 */
const resumeText = `
Riley Okafor
Backend Engineer

Summary
Backend engineer with six years of experience building reliable Python services,
data pipelines, and internal platforms for distributed product teams.

Experience
- Led delivery of a FastAPI service used by 40 internal teams and reduced request
  latency by 35 percent through query tuning and cache design.
- Owned PostgreSQL schema changes, migration rehearsals, monitoring, and incident
  response for a customer workflow processing 2 million events each month.
- Built CI pipelines that cut deployment time from 25 minutes to 8 minutes while
  preserving rollback and audit controls.

Skills
Python, FastAPI, PostgreSQL, SQLAlchemy, React, TypeScript, Docker, CI/CD, AWS
`.trim()

type AccessDecision = {
  state: string
  treatment: string
  reason: string
  can_export: boolean
  policy_version: string
}

type ResumeIssue = {
  id: string
  title: string
  why_it_matters: string
  fix: string
}

type ResumePayload = {
  issues: ResumeIssue[]
  strengths: string[]
  top_actions: Array<{ title: string; action: string }>
}

type LiveRunResponse = ResumePayload & {
  history_id: string | null
  saved: boolean
  access_mode: string
  locked_actions: string[]
  access_decision: AccessDecision
}

type SavedRunResponse = {
  id: string
  saved: boolean
  access_mode: string
  locked_actions: string[]
  access_decision: AccessDecision
  result_payload: ResumePayload
}

async function gotoHydrated(page: Page, path: string) {
  await page.goto(path)
  await page.locator('html[data-hydrated="true"]').waitFor()
  await page.evaluate(() => localStorage.setItem('cw-cookie-consent', 'accepted'))
}

async function register(page: Page) {
  const email = uniqueEmail('r9-control-journey')
  await gotoHydrated(page, '/login')
  await page.getByRole('tab', { name: 'Create Account' }).click()
  await page.locator('#register-name').fill('R9 Control Journey')
  await page.locator('#register-email').fill(email)
  await page.locator('#register-password').fill(password)
  await page.locator('#register-tos').check()
  // Waiting on the registration response first keeps a slow local machine from
  // being reported as a missing signed-in heading.
  const registered = page.waitForResponse(
    (response) =>
      response.url() === `${apiUrl}/auth/register` && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Create free account' }).click()
  expect((await registered).status(), 'registration accepted').toBe(201)
  await expect(page.getByRole('heading', { name: 'You are already signed in' })).toBeVisible({
    timeout: 30_000,
  })
  return email
}

/** Runs Resume Analyzer through the real form and returns the live tool response. */
async function runResumeAnalyzer(page: Page): Promise<LiveRunResponse> {
  await gotoHydrated(page, '/resume')
  await page.getByRole('button', { name: 'Paste text instead' }).click()
  await page.locator('#resume-resumeText').fill(resumeText)
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url() === `${apiUrl}/resume/analyze` && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Review resume' }).click()
  const response = await responsePromise
  expect(response.ok(), 'resume/analyze responded 2xx').toBe(true)
  return (await response.json()) as LiveRunResponse
}

/**
 * A gate that ships the payload and hides it in the browser is exactly the shape
 * ADR 0003 rules out, so this looks for one from the delivered DOM's point of
 * view: overlay/ad markup, a dimmed or blurred content chain, CSS-clipped issue
 * text, and gate copy anywhere in the result shell.
 */
async function collectGateArtifacts(page: Page) {
  return page.evaluate(() => {
    const describe = (element: Element) => {
      const classes = String((element as HTMLElement).className || '')
        .split(/\s+/)
        .filter(Boolean)
        .join('.')
      return classes ? `${element.tagName.toLowerCase()}.${classes}` : element.tagName.toLowerCase()
    }

    const shell = document.querySelector('.result-shell')
    const content = document.querySelector('.result-content')
    if (!shell || !content) {
      return {
        missing: [!shell ? '.result-shell' : '', !content ? '.result-content' : ''].filter(Boolean),
        overlays: ['unknown — result markup missing'],
        dimmed: [],
        clipped: [],
        gateCopy: [],
      }
    }

    // The removed client path used `.ad-gate-card`; the rest are the shapes a
    // reintroduced gate or ad placeholder would plausibly take. Real AdSense is
    // banned in V1, so a live ad frame is a finding too.
    const gateSelectors = [
      '.ad-gate-card',
      '.ad-gate',
      '[data-ad-gate]',
      '[data-ad]',
      '[data-ad-slot]',
      'ins.adsbygoogle',
      '[id*="adsense" i]',
      '[id*="google_ads" i]',
      '[class*="ad-gate" i]',
      '[class*="ad-slot" i]',
      '[class*="ad-placeholder" i]',
      '[class*="paywall" i]',
      '[class*="upsell" i]',
      '[class*="result-gate" i]',
      '[class*="result-lock" i]',
      'iframe[src*="doubleclick" i]',
      'iframe[src*="googlesyndication" i]',
    ]
    const overlays = gateSelectors.filter((selector) => document.querySelector(selector) !== null)

    // Blur/dim/pointer-lock anywhere between the delivered issue cards and the
    // document root is the classic "ship it then obscure it" gate. `filter` and
    // `pointer-events` are not inherited, so every link in the chain is checked
    // rather than just the leaf or just `.result-content`.
    const dimmed: string[] = []
    const chain = new Set<Element>()
    const roots: Element[] = [content, ...Array.from(content.querySelectorAll('.feedback-issue'))]
    for (const root of roots) {
      for (let element: Element | null = root; element; element = element.parentElement) {
        chain.add(element)
      }
    }
    for (const element of chain) {
      const style = getComputedStyle(element)
      if (style.filter.includes('blur')) dimmed.push(`${describe(element)} filter=${style.filter}`)
      if (style.pointerEvents === 'none') dimmed.push(`${describe(element)} pointer-events=none`)
      if (Number(style.opacity) < 0.99) dimmed.push(`${describe(element)} opacity=${style.opacity}`)
    }

    // CSS truncation of the delivered issue text (line clamp, ellipsis, or an
    // overflow box shorter than its content).
    const clipped: string[] = []
    const textNodes = content.querySelectorAll(
      '.feedback-issue, .feedback-issue__title, .feedback-issue__box-text',
    )
    for (const element of Array.from(textNodes)) {
      const style = getComputedStyle(element)
      if (style.webkitLineClamp && style.webkitLineClamp !== 'none') {
        clipped.push(`${describe(element)} line-clamp=${style.webkitLineClamp}`)
      }
      if (style.textOverflow === 'ellipsis') {
        clipped.push(`${describe(element)} text-overflow=ellipsis`)
      }
      if (style.overflowY !== 'visible' && element.scrollHeight > element.clientHeight + 2) {
        clipped.push(
          `${describe(element)} overflow-clipped ${element.scrollHeight}>${element.clientHeight}`,
        )
      }
      if (style.filter.includes('blur')) {
        dimmed.push(`${describe(element)} filter=${style.filter}`)
      }
    }

    const copy = (shell as HTMLElement).innerText
    const gateCopy = [
      /unlock/i,
      /watch an ad/i,
      /advertisement/i,
      /sponsored/i,
      /paywall/i,
      /upgrade to (see|view|read|unlock)/i,
      /subscribe to (see|view|read|unlock)/i,
      /(locked|hidden|blurred) until/i,
      /see the full result/i,
    ]
      .filter((pattern) => pattern.test(copy))
      .map((pattern) => pattern.source)

    return { missing: [] as string[], overlays, dimmed, clipped, gateCopy }
  })
}

/** Every browser-owned key, so a reintroduced client unlock contract is visible. */
async function browserStorageKeys(page: Page) {
  return page.evaluate(() => [
    ...Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index) || ''),
    ...Array.from({ length: sessionStorage.length }, (_, index) => sessionStorage.key(index) || ''),
  ])
}

/**
 * Asserts the delivered result is the *whole* result: one rendered card per
 * server-returned issue with its full text, and nothing gating, dimming,
 * clipping, or covering it.
 */
async function expectResultDeliveredInFull(
  page: Page,
  payload: ResumePayload,
  label: string,
  options: { exportAffordance?: boolean } = {},
) {
  // Guard against a vacuous pass if the fixture ever stops producing findings.
  expect(payload.issues.length, `${label}: server returned issues to render`).toBeGreaterThanOrEqual(2)
  expect(payload.top_actions.length, `${label}: server returned top actions`).toBeGreaterThan(0)
  expect(payload.strengths.length, `${label}: strengths fit the rendered window`).toBeLessThanOrEqual(4)

  await expect(page.locator('.result-shell'), `${label}: result shell`).toBeVisible()
  await expect(page.locator('.result-content'), `${label}: result content`).toBeVisible()

  const issueCards = page.locator('.feedback-issue')
  await expect(issueCards, `${label}: one card per server issue`).toHaveCount(payload.issues.length)
  await expect(
    page.locator('.feedback-issue__title'),
    `${label}: every issue title rendered verbatim`,
  ).toHaveText(payload.issues.map((issue) => issue.title))

  for (const [index, issue] of payload.issues.entries()) {
    const card = issueCards.nth(index)
    await expect(card, `${label}: issue ${issue.id} "why it matters"`).toContainText(
      issue.why_it_matters,
    )
    await expect(card, `${label}: issue ${issue.id} fix`).toContainText(issue.fix)
  }

  await expect(
    page.locator('.feedback-strength'),
    `${label}: every strength rendered`,
  ).toHaveCount(payload.strengths.length)
  await expect(
    page.locator('.fix-first-card'),
    `${label}: every top action rendered`,
  ).toHaveCount(payload.top_actions.length)

  // Delivery affordances are part of "full access": copy is always offered, and
  // the text export button rides on `exportable_sections`, which the pipeline
  // attaches to the response but does not persist — so a re-read saved run has no
  // export button today. That asymmetry is a pre-existing product gap, not an
  // access decision; the server-side export seam is asserted separately.
  await expect(
    page.getByRole('button', { name: 'Copy result to clipboard' }),
    `${label}: copy affordance offered`,
  ).toBeVisible()
  if (options.exportAffordance) {
    await expect(
      page.getByRole('button', { name: 'Export result as plain-text file' }),
      `${label}: export affordance offered`,
    ).toBeVisible()
  }

  // Playwright's actionability check is the overlay test: it fails if anything
  // intercepts pointer events over the last (deepest) delivered issue.
  await issueCards.last().click({ trial: true, timeout: 10_000 })

  // Scroll-reveal wrappers start transparent until they enter the viewport, so
  // walk the whole page once before reading computed styles; `once: true` keeps
  // them revealed afterwards.
  await page.evaluate(async () => {
    window.scrollTo(0, document.body.scrollHeight)
    await new Promise((resolve) => setTimeout(resolve, 700))
    window.scrollTo(0, 0)
  })

  await expect
    .poll(async () => collectGateArtifacts(page), {
      message: `${label}: no gate, dimming, clipping, or ad placeholder over the result`,
      timeout: 10_000,
    })
    .toEqual({ missing: [], overlays: [], dimmed: [], clipped: [], gateCopy: [] })
}

test('authenticated run delivers the server access decision and the whole result to the browser', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await register(page)

  // 1. Live result surface.
  const live = await runResumeAnalyzer(page)
  expect(live.access_decision, 'live_result access decision').toEqual(CONTROL_DECISION)
  expect(live.access_mode, 'live_result access mode').toBe('authenticated')
  expect(live.saved, 'authenticated run persisted').toBe(true)
  expect(live.locked_actions, 'no action locked for an owner').toEqual([])
  const historyId = live.history_id
  expect(historyId, 'live run returned a history id').toBeTruthy()
  await expect(page).toHaveURL(new RegExp(`/resume/result/${historyId}$`))
  await expectResultDeliveredInFull(page, live, 'live result', { exportAffordance: true })

  // 2. Saved result surface — a reload drops the client cache and refetches.
  const detailUrl = `${apiUrl}/history/${historyId}`
  const detailPromise = page.waitForResponse(
    (response) => response.url() === detailUrl && response.request().method() === 'GET',
  )
  await page.reload()
  await page.locator('html[data-hydrated="true"]').waitFor()
  const detail = (await (await detailPromise).json()) as SavedRunResponse
  expect(detail.access_decision, 'saved_result access decision').toEqual(CONTROL_DECISION)
  expect(detail.locked_actions, 'saved_result locks nothing').toEqual([])
  await expectResultDeliveredInFull(page, detail.result_payload, 'saved result')

  // 3. History list surface — a list row is a delivery surface too, so it must
  //    carry the decision rather than let the client assume a default.
  const listResponse = await page.request.get(`${apiUrl}/history?page=1&page_size=10`)
  expect(listResponse.ok(), 'history list responded 2xx').toBe(true)
  const list = (await listResponse.json()) as { items: Array<{ id: string; access_decision: AccessDecision }> }
  const listedRun = list.items.find((item) => item.id === historyId)
  expect(listedRun, 'run present in history list').toBeTruthy()
  expect(listedRun?.access_decision, 'history list access decision').toEqual(CONTROL_DECISION)

  // 4. Export seam. `can_export: true` means the access boundary must not refuse.
  //    Resume has no PDF exporter, so 400 is the tool answer; 403 would mean the
  //    export gate closed, which is the regression this pins.
  const exportResponse = await page.request.get(`${apiUrl}/history/${historyId}/export/pdf`)
  expect(exportResponse.status(), 'export not refused by the access boundary').not.toBe(403)
  expect([200, 400], `export status was ${exportResponse.status()}`).toContain(
    exportResponse.status(),
  )

  // 5. No client-side gate exists: wiping every browser-owned store cannot change
  //    what is delivered, because the decision is the server's alone (D-048), and
  //    no unlock/entitlement key is written anywhere (the `ad-unlocked` contract
  //    was removed in #127 / D-051).
  expect(
    (await browserStorageKeys(page)).filter((key) =>
      /unlock|entitle|paywall|ad[-_]?gate|adsense/i.test(key),
    ),
    'no client unlock or entitlement key',
  ).toEqual([])

  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
    localStorage.setItem('cw-cookie-consent', 'accepted')
  })
  const refetchPromise = page.waitForResponse(
    (response) => response.url() === detailUrl && response.request().method() === 'GET',
  )
  await page.reload()
  await page.locator('html[data-hydrated="true"]').waitFor()
  const refetched = (await (await refetchPromise).json()) as SavedRunResponse
  expect(refetched.access_decision, 'access decision after clearing browser state').toEqual(
    CONTROL_DECISION,
  )
  await expectResultDeliveredInFull(page, refetched.result_payload, 'result after cleared storage')
})

test('guest run carries the same control decision into client storage and renders in full', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await gotoHydrated(page, '/')

  const live = await runResumeAnalyzer(page)
  expect(live.access_decision, 'guest live_result access decision').toEqual(CONTROL_DECISION)
  expect(live.access_mode, 'guest access mode').toBe('guest_demo')
  expect(live.saved, 'guest run is never persisted').toBe(false)
  // A guest loses save/favorite/continue/history — never result visibility.
  expect(live.locked_actions.sort(), 'guest locks only account actions').toEqual([
    'continue',
    'favorite',
    'history',
    'save',
  ])

  await expect(page).toHaveURL(/\/resume\/result\/resume-demo-\d+$/)
  const demoId = page.url().split('/').at(-1) as string

  // The client's own copy of the decision. The guest demo record the browser
  // keeps is assembled locally, but the server's payload — access decision
  // included — is stored inside it verbatim, so this is the decision the result
  // page actually renders from after a refresh.
  const stored = (await page.evaluate(
    (id) => JSON.parse(sessionStorage.getItem(`cw:demo-result:${id}`) || 'null'),
    demoId,
  )) as { result_payload?: { access_decision?: AccessDecision } } | null
  expect(stored?.result_payload?.access_decision, 'decision persisted client-side as issued').toEqual(
    CONTROL_DECISION,
  )

  await expectResultDeliveredInFull(page, live, 'guest result', { exportAffordance: true })

  expect(
    (await browserStorageKeys(page)).filter((key) =>
      /unlock|entitle|paywall|ad[-_]?gate|adsense/i.test(key),
    ),
    'no guest-side unlock or entitlement key',
  ).toEqual([])
})
