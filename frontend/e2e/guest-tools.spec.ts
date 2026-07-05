import { expect, test, type Page } from '@playwright/test'

const providerFailureMarker = '[E2E_PROVIDER_FAILURE]'

const resumeText = `
Jordan Rivera
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
- Mentored four engineers and coordinated delivery with product, design, security,
  and support partners across three quarterly releases.

Skills
Python, FastAPI, PostgreSQL, SQLAlchemy, React, TypeScript, Docker, CI/CD, AWS
`.trim()

const jobDescription = `
Senior Backend Engineer

Build and operate Python and FastAPI services backed by PostgreSQL. Lead schema
design, improve reliability and observability, mentor engineers, and collaborate
with product and security partners. Experience with Docker, CI/CD, and AWS is
required. Candidates should show measurable impact in production systems.
`.trim()

type GuestTool = {
  label: string
  path: string
  resultPath: RegExp
  generative: boolean
  prepare: (page: Page, resume: string) => Promise<void>
}

async function gotoHydrated(page: Page, path: string) {
  await page.goto(path)
  await page.locator('html[data-hydrated="true"]').waitFor()
}

async function openPasteForm(page: Page, formSelector: string) {
  const pasteButton = page.getByRole('button', { name: 'Paste text instead' })
  const formField = page.locator(formSelector)
  await expect(pasteButton.or(formField)).toBeVisible()
  if (await pasteButton.isVisible()) {
    await pasteButton.click()
  }
}

const guestTools: GuestTool[] = [
  {
    label: 'Resume Analyzer',
    path: '/resume',
    resultPath: /\/resume\/result\/resume-demo-\d+$/,
    generative: false,
    prepare: async (page, resume) => {
      await openPasteForm(page, '#resume-resumeText')
      await page.locator('#resume-resumeText').fill(resume)
      await page.getByRole('button', { name: 'Review resume' }).click()
    },
  },
  {
    label: 'Job Match',
    path: '/job-match',
    resultPath: /\/job-match\/result\/job-match-demo-\d+$/,
    generative: false,
    prepare: async (page, resume) => {
      await openPasteForm(page, '#job-match-resumeText')
      await page.locator('#job-match-resumeText').fill(resume)
      await page.locator('#job-match-jobDescription').fill(jobDescription)
      await page.getByRole('button', { name: 'Compare to role' }).click()
    },
  },
  {
    label: 'Career Path',
    path: '/career',
    resultPath: /\/career\/result\/career-demo-\d+$/,
    generative: true,
    prepare: async (page, resume) => {
      await openPasteForm(page, '#career-resumeText')
      await page.locator('#career-resumeText').fill(resume)
      await page.locator('#career-targetRole').fill('Engineering Manager')
      await page.getByRole('button', { name: 'Compare career paths' }).click()
    },
  },
  {
    label: 'Cover Letter',
    path: '/cover-letter',
    resultPath: /\/cover-letter\/result\/cover-letter-demo-\d+$/,
    generative: true,
    prepare: async (page, resume) => {
      await openPasteForm(page, '#cover-letter-resumeText')
      await page.locator('#cover-letter-resumeText').fill(resume)
      await page.locator('#cover-letter-jobDescription').fill(jobDescription)
      await page.getByRole('button', { name: 'Draft cover letter' }).click()
    },
  },
  {
    label: 'Interview Q&A',
    path: '/interview',
    resultPath: /\/interview\/result\/interview-demo-\d+$/,
    generative: true,
    prepare: async (page, resume) => {
      await openPasteForm(page, '#interview-resumeText')
      await page.locator('#interview-resumeText').fill(resume)
      await page.locator('#interview-jobDescription').fill(jobDescription)
      await page.getByRole('button', { name: 'Build interview prep' }).click()
    },
  },
  {
    label: 'Portfolio Planner',
    path: '/portfolio',
    resultPath: /\/portfolio\/result\/portfolio-demo-\d+$/,
    generative: true,
    prepare: async (page, resume) => {
      await openPasteForm(page, '#portfolio-resumeText')
      await page.locator('#portfolio-targetRole').fill('Senior Backend Engineer')
      await page.locator('#portfolio-resumeText').fill(resume)
      await page.getByRole('button', { name: 'Generate roadmap' }).click()
    },
  },
]

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    localStorage.setItem('cw-cookie-consent', 'accepted')
  })
})

async function runGuestTool(page: Page, tool: GuestTool, resume = resumeText) {
  await gotoHydrated(page, tool.path)
  await tool.prepare(page, resume)
}

async function register(page: Page) {
  await gotoHydrated(page, '/login')
  await page.getByRole('tab', { name: 'Create Account' }).click()
  await page.locator('#register-name').fill('R2 Guest Audit')
  await page.locator('#register-email').fill(`guest-audit-${Date.now()}@example.com`)
  await page.locator('#register-password').fill('correct-horse-battery-staple')
  await page.locator('#register-tos').check()
  await page.getByRole('button', { name: 'Create free account' }).click()
  await expect(page.getByRole('heading', { name: 'You are already signed in' })).toBeVisible()
}

for (const tool of guestTools) {
  test(`${tool.label} guest result survives refresh and expires when transient state is cleared`, async ({
    page,
  }) => {
    await runGuestTool(page, tool)
    await expect(page).toHaveURL(tool.resultPath)
    await expect(page.getByText(`${tool.label} · Guest demo`)).toBeVisible()
    const resultUrl = page.url()

    await page.reload()
    await page.locator('html[data-hydrated="true"]').waitFor()
    await expect(page.getByText(`${tool.label} · Guest demo`)).toBeVisible()

    await gotoHydrated(page, '/')
    await gotoHydrated(page, resultUrl)
    await expect(page.getByText(`${tool.label} · Guest demo`)).toBeVisible()

    const demoId = resultUrl.split('/').at(-1)
    await page.evaluate((id) => {
      sessionStorage.removeItem(`cw:demo-result:${id}`)
    }, demoId)
    await page.reload()

    await expect(page.getByText('Demo expired')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Run the tool again' })).toBeVisible()
  })
}

test('guest runs for all six tools never appear in persisted history', async ({
  context,
  page,
}) => {
  test.setTimeout(120_000)

  for (const tool of guestTools) {
    const guestTab = await context.newPage()
    await runGuestTool(guestTab, tool)
    await expect(guestTab).toHaveURL(tool.resultPath)
    await guestTab.close()
  }

  await register(page)
  await gotoHydrated(page, '/history')

  await expect(page.getByText('No runs found')).toBeVisible()
})

for (const tool of guestTools) {
  test(`${tool.label} preserves its tool-specific provider failure behavior`, async ({ page }) => {
    await runGuestTool(page, tool, `${resumeText}\n${providerFailureMarker}`)

    if (tool.generative) {
      await expect(page).toHaveURL(new RegExp(`${tool.path}$`))
      await expect(
        page.getByText(
          'Generation failed because the AI service is unavailable. Try again in a moment.',
        ),
      ).toBeVisible()
      return
    }

    await expect(page).toHaveURL(tool.resultPath)
    await expect(page.getByText(`${tool.label} · Guest demo`)).toBeVisible()
  })
}
