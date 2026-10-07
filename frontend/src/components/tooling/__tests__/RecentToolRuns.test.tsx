import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RecentToolRuns } from '#/components/tooling/toolPageShared'

const getHistoryMock = vi.hoisted(() => vi.fn())
let sessionStatus: 'guest' | 'authenticated' = 'authenticated'

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: ({ to, search, children, ...props }: { to: string; search?: Record<string, string>; children: React.ReactNode }) => (
      <a href={search ? `${to}?${new URLSearchParams(search)}` : to} {...props}>{children}</a>
    ),
  }
})
vi.mock('#/hooks/useSession', () => ({
  useSession: () => ({ status: sessionStatus, openAuthDialog: vi.fn() }),
}))
vi.mock('#/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/lib/api/client')>()),
  getHistory: getHistoryMock,
}))

function run(id: string, label: string | null, tool = 'resume', workspace: Record<string, unknown> | null = null) {
  return {
    id,
    tool_name: tool,
    label,
    is_favorite: false,
    created_at: '2026-10-03T10:00:00Z',
    saved: true,
    access_mode: 'authenticated',
    locked_actions: [],
    metadata: {},
    workspace,
  }
}

function renderRuns(toolId: 'resume' | 'career' = 'resume') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <RecentToolRuns toolId={toolId} />
    </QueryClientProvider>,
  )
}

describe('RecentToolRuns', () => {
  beforeEach(() => {
    sessionStatus = 'authenticated'
    getHistoryMock.mockReset()
  })

  it('lists the last runs as links to their results, the score as a pill, and a link to all of them in History', async () => {
    getHistoryMock.mockResolvedValue({
      items: [run('r1', 'Resume Analysis (77/100)'), run('r2', null)],
      total: 2,
      page: 1,
      page_size: 3,
      has_more: false,
    })
    renderRuns()
    expect(await screen.findByRole('heading', { name: 'Recent runs' })).toBeTruthy()
    // consistency-F23: a run with no subject is titled by when it ran, never by the tool's own name.
    const link = await screen.findByRole('link', { name: /^Oct 3, / })
    expect(link.getAttribute('href')).toBe('/resume/result/r1')
    expect(screen.queryByRole('link', { name: 'Resume Analysis' })).toBeNull()
    expect(link.closest('li')?.querySelector('.kit-badge[data-score]')?.textContent).toBe('77/100')
    // The score is read with the link's description.
    const description = document.getElementById(link.getAttribute('aria-describedby') ?? '')?.textContent ?? ''
    expect(description).toContain('score 77/100')
    const viewAll = screen.getByRole('link', { name: 'View all Resume Analyzer runs in History' })
    expect(viewAll.textContent).toBe('View all')
    expect(viewAll.getAttribute('href')).toBe('/history?tool=resume')
    expect(screen.getByRole('link', { name: 'Untitled run' }).getAttribute('href')).toBe('/resume/result/r2')
    expect(screen.getByRole('list', { name: 'Recent runs' }).querySelectorAll('li')).toHaveLength(2)
    expect(getHistoryMock).toHaveBeenCalledWith({ tool: 'resume', page: 1, page_size: 3 })
  })

  it('tells two runs with the same label apart by what they were about', async () => {
    const workspace = (role: string, company: string) => ({
      id: `ws-${company}`, label: null, is_pinned: false, company, role, status: 'saved', deadline: null,
      listing: null, linked_run_ids: [], updated_at: '2026-10-03T10:00:00Z',
    })
    getHistoryMock.mockResolvedValue({
      items: [
        run('r1', 'Job Match (48%)', 'job-match', workspace('Platform Engineer', 'Northwind Labs')),
        run('r2', 'Job Match (48%)', 'job-match', workspace('Data Analyst', 'Harbor Health')),
      ],
      total: 2, page: 1, page_size: 3, has_more: false,
    })
    renderRuns()
    // The subject is the row's title (the link), so it is what a narrow rail keeps; the tool's own name says nothing here.
    expect(await screen.findByRole('link', { name: 'Platform Engineer at Northwind Labs' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Data Analyst at Harbor Health' })).toBeTruthy()
  })

  it('titles each run by its subject, not the tool name, wraps it to two lines, and puts the date under it', async () => {
    const withHeadline = { ...run('r3', 'Resume Analysis (77/100)'), metadata: { summary_headline: 'Strong foundation, thin impact evidence' } }
    getHistoryMock.mockResolvedValue({
      items: [run('r1', 'Career Plan (Staff Backend Engineer)', 'career'), run('r2', 'Interview Prep (4 questions)', 'interview'), withHeadline],
      total: 3, page: 1, page_size: 3, has_more: false,
    })
    renderRuns()
    expect(await screen.findByRole('link', { name: 'Staff Backend Engineer' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '4 questions' })).toBeTruthy()
    // consistency-F06: the headline is never the title (it clamped to "Strong foundation: 2…" in the rail and is not the
    // name History shows); it is the line under the title, as in History. consistency-F23: a run with no subject is
    // titled by its date and time (the tool's name, three times over, told the runs apart by nothing).
    const time = new Date('2026-10-03T10:00:00Z').toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    expect(screen.getByRole('link', { name: `Oct 3, ${time}` })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Resume Analysis' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Strong foundation, thin impact evidence' })).toBeNull()
    const rows = [...screen.getByRole('list', { name: 'Recent runs' }).querySelectorAll('li')]
    // Two lines for the subject (kit Row overflow="clamp"), one for the date: no subject cut to a dozen letters.
    expect(rows.every((row) => row.getAttribute('data-overflow') === 'clamp')).toBe(true)
    // consistency-F17: the headline has its own line under the date (a dated title has no date line), so it gets the
    // rail's full width instead of the three letters left after "Oct 6, 2:13 PM · " (it read "Stro…").
    expect(rows.map((row) => [...row.querySelectorAll('.kit-row__subtitle')].map((line) => line.textContent))).toEqual([
      ['Oct 3'],
      ['Oct 3'],
      ['Strong foundation, thin impact evidence, score 77/100'],
    ])
    // consistency-F23: the score pill sits on the title's own line (kit RowTitle aside), not in a side column that
    // narrowed the headline under it to ~150px.
    const pill = rows[2].querySelector('.kit-badge[data-score]') as HTMLElement
    expect(pill.closest('.kit-row__title-line')).toBeTruthy()
    expect(rows[2].querySelector('.kit-row__meta')).toBeNull()
    expect(pill.getAttribute('aria-hidden')).toBe('true')
  })

  it('gives the headline its own line when the date carries a time, and still describes the link with date, headline and score', async () => {
    const at = (id: string, label: string, createdAt: string) => ({
      ...run(id, label), created_at: createdAt, metadata: { summary_headline: `Headline ${id}` },
    })
    getHistoryMock.mockResolvedValue({
      items: [at('r1', 'Resume Analysis: Staff Engineer (93/100)', '2026-10-03T14:02:00Z'), at('r2', 'Resume Analysis: Staff Engineer (90/100)', '2026-10-03T10:00:00Z')],
      total: 2, page: 1, page_size: 3, has_more: false,
    })
    renderRuns()
    const [first] = await screen.findAllByRole('link', { name: 'Staff Engineer' })
    const row = first.closest('li') as HTMLElement
    const lines = [...row.querySelectorAll('.kit-row__subtitle')].map((line) => line.textContent ?? '')
    const time = new Date('2026-10-03T14:02:00Z').toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    expect(lines).toEqual([`Oct 3, ${time}`, 'Headline r1, score 93/100'])
    // Two lines for the headline, at the body's full width (kit RowSubtitle lines={2}); the date keeps one.
    expect([...row.querySelectorAll('.kit-row__subtitle')].map((line) => line.getAttribute('data-lines'))).toEqual([null, '2'])
    const description = (first.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ')
    expect(description).toBe(`Oct 3, ${time} Headline r1, score 93/100`)
  })

  // consistency-F23: three plain Resume Analyzer runs read "Resume Analysis" three times; each is titled by when it ran.
  it('titles runs without a subject by their date and time, and describes the link with the headline and score', async () => {
    const at = (id: string, createdAt: string, headline?: string) => ({
      ...run(id, 'Resume Analysis (93/100)'), created_at: createdAt, metadata: headline ? { summary_headline: headline } : {},
    })
    getHistoryMock.mockResolvedValue({
      items: [at('r1', '2026-10-03T14:02:00Z', 'Strong foundation'), at('r2', '2026-10-03T10:00:00Z')],
      total: 2, page: 1, page_size: 3, has_more: false,
    })
    renderRuns()
    const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    const first = await screen.findByRole('link', { name: `Oct 3, ${time('2026-10-03T14:02:00Z')}` })
    const second = screen.getByRole('link', { name: `Oct 3, ${time('2026-10-03T10:00:00Z')}` })
    const describe = (link: HTMLElement) => (link.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ')
    expect(describe(first)).toBe('Strong foundation, score 93/100')
    expect(describe(second)).toBe('score 93/100')
    // No date line under a dated title.
    expect([...(first.closest('li') as HTMLElement).querySelectorAll('.kit-row__subtitle')].map((line) => line.textContent)).toEqual([
      'Strong foundation, score 93/100',
    ])
  })

  it('titles a Career Path run by the role it recommends, which is shorter and more telling than its headline', async () => {
    const career = { ...run('r1', 'Career Plan (Platform Engineer)', 'career'), metadata: { summary_headline: 'Platform Engineer is the clearest next move: your Python and AWS work transfers.' } }
    getHistoryMock.mockResolvedValue({ items: [career], total: 1, page: 1, page_size: 3, has_more: false })
    renderRuns('career')
    expect(await screen.findByRole('link', { name: 'Platform Engineer' })).toBeTruthy()
  })

  // tool-inputs-F29: once a run's label names its job, two runs of the same tool read differently in the rail.
  it('titles a run by the job its label names, keeping the score as the pill', async () => {
    getHistoryMock.mockResolvedValue({
      items: [run('r1', 'Resume Analysis: Staff Engineer (81/100)'), run('r2', 'Resume Analysis: Platform Lead (77/100)')],
      total: 2,
      page: 1,
      page_size: 3,
      has_more: false,
    })
    renderRuns()
    const first = await screen.findByRole('link', { name: 'Staff Engineer' })
    expect(first.closest('li')?.querySelector('.kit-badge[data-score]')?.textContent).toBe('81/100')
    expect(screen.getByRole('link', { name: 'Platform Lead' })).toBeTruthy()
  })

  it('keeps a name the user gave a run as its title', async () => {
    const renamed = { ...run('r1', 'Northwind second pass (81/100)'), metadata: { summary_headline: 'Close to ready' } }
    getHistoryMock.mockResolvedValue({ items: [renamed], total: 1, page: 1, page_size: 3, has_more: false })
    renderRuns()
    expect(await screen.findByRole('link', { name: 'Northwind second pass' })).toBeTruthy()
  })

  it('adds the time when two rows would otherwise read the same', async () => {
    const at = (id: string, createdAt: string) => ({ ...run(id, 'Resume Analysis: Staff Engineer (93/100)'), created_at: createdAt })
    getHistoryMock.mockResolvedValue({
      items: [at('r1', '2026-10-03T14:02:00Z'), at('r2', '2026-10-03T10:00:00Z'), run('r3', 'Other run')],
      total: 3, page: 1, page_size: 3, has_more: false,
    })
    renderRuns()
    await screen.findByRole('link', { name: 'Other run' })
    // The date (and, when needed, the time) leads the line under the title.
    const metas = [...screen.getByRole('list', { name: 'Recent runs' }).querySelectorAll('li')].map(
      (row) => row.querySelector('.kit-row__subtitle')?.textContent ?? '',
    )
    const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    expect(metas[0]).toContain(time('2026-10-03T14:02:00Z'))
    expect(metas[1]).toContain(time('2026-10-03T10:00:00Z'))
    // A row with nothing to confuse it with keeps the plain date.
    expect(metas[2]).not.toContain(time('2026-10-03T10:00:00Z'))
  })

  it('tells a signed-in user with no runs what will appear (the section stays, no link to an empty History), and shows nothing to a guest', async () => {
    getHistoryMock.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 3, has_more: false })
    renderRuns()
    expect(await screen.findByText('No runs yet')).toBeTruthy()
    expect(screen.getByText('Your Resume Analyzer results will be listed here.')).toBeTruthy()
    // The Sticker empty state (die-cut frame, display title), not a stray grey line under the heading.
    expect(screen.getByText('No runs yet').closest('.kit-empty')?.getAttribute('data-size')).toBe('compact')
    expect(screen.queryByRole('link', { name: /View all/ })).toBeNull()

    cleanup()
    getHistoryMock.mockClear()
    sessionStatus = 'guest'
    const guest = renderRuns()
    expect(guest.container.querySelector('section')).toBeNull()
    expect(getHistoryMock).not.toHaveBeenCalled()
  })

  it('keeps the row height while loading and offers a retry when the list cannot be loaded', async () => {
    getHistoryMock.mockRejectedValueOnce(new Error('boom'))
    renderRuns()
    expect(await screen.findByText("Recent runs couldn't be loaded")).toBeTruthy()

    getHistoryMock.mockResolvedValueOnce({ items: [run('r1', 'Backend application')], total: 1, page: 1, page_size: 3, has_more: false })
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('link', { name: 'Backend application' })).toBeTruthy()
  })
})
