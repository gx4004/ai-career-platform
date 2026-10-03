/** Realistic specimen data for the structure gallery: long titles, missing fields, RTL text. */

export type Job = {
  id: string
  title: string
  company: string
  location: string | null
  posted: string | null
  source: string | null
  fit: number | null
  skills: string | null
  remote?: boolean
}

export const LONG_TITLE =
  'Staff Software Engineer, Data Infrastructure and Developer Productivity (Berlin or remote across the EU, relocation support available) for the ingestion platform behind matching'

export const JOBS: Job[] = [
  {
    id: 'j1',
    title: 'Senior Backend Engineer, Platform',
    company: 'Northwind Labs',
    location: 'Remote, Europe',
    posted: '3 days ago',
    source: 'Greenhouse',
    fit: 92,
    skills: '7 of 8 skills',
  },
  { id: 'j2', title: LONG_TITLE, company: 'Fernhill Systems', location: 'Berlin', posted: 'Yesterday', source: 'Lever', fit: 74, skills: '6 of 9 skills' },
  { id: 'j3', title: 'Engineering Manager', company: 'Tidewater', location: null, posted: null, source: null, fit: null, skills: null },
  { id: 'j4', title: 'Platform Engineer', company: 'Brightpath', location: 'Lisbon', posted: '1 week ago', source: 'Ashby', fit: 58, skills: '4 of 7 skills', remote: true },
  {
    id: 'j5',
    title: 'مهندس برمجيات أول، منصة البيانات والبنية التحتية للمطابقة الذكية بين الوظائف والمرشحين',
    company: 'شركة الأفق',
    location: 'الرياض',
    posted: 'قبل ٣ أيام',
    source: 'Lever',
    fit: 41,
    skills: '3 of 7 skills',
  },
  { id: 'j6', title: 'Data Engineer', company: 'Quillon', location: 'Amsterdam', posted: '2 weeks ago', source: 'Greenhouse', fit: 23, skills: '2 of 9 skills' },
]

export type RunRow = {
  id: string
  tool: string
  label: string
  date: string
  score: number | null
}

export const RUNS: RunRow[] = [
  { id: 'r1', tool: 'Resume', label: 'Resume for Senior Backend Engineer, Platform', date: 'Sep 29', score: 84 },
  { id: 'r2', tool: 'Match', label: 'Northwind Labs, Senior Backend Engineer', date: 'Sep 28', score: 92 },
  { id: 'r3', tool: 'Letter', label: 'Cover letter, Fernhill Systems', date: 'Sep 26', score: null },
  { id: 'r4', tool: 'Interview', label: 'Interview practice, system design round', date: 'Sep 24', score: 71 },
]

export const FIXES = [
  { title: 'Quantify the migration bullet', detail: 'Your strongest bullet says "improved performance". Say by how much and over what period.', level: 'High' },
  { title: 'Move Kubernetes into the summary', detail: 'The posting asks for it in the first paragraph; yours appears only in the skills list.', level: 'Medium' },
  { title: 'Drop the 2014 internship', detail: 'It adds a line and no signal for a senior role.', level: 'Low' },
]

export type UserRow = {
  id: string
  email: string
  name: string | null
  role: 'Admin' | 'Member'
  runs: number
  tokensIn: number
  tokensOut: number
  cost: number
  errors: number
  cache: number
  p50: number
  p95: number
  created: string
}

export const USERS: UserRow[] = [
  { id: 'u1', email: 'ada@example.com', name: 'Ada Lovelace', role: 'Admin', runs: 148, tokensIn: 1_204_332, tokensOut: 388_120, cost: 12.84, errors: 3, cache: 41, p50: 2.4, p95: 9.8, created: 'Sep 2, 2026' },
  { id: 'u2', email: 'a-very-long-address-for-testing-wrapping@subdomain.long-company-name.example.com', name: null, role: 'Member', runs: 12, tokensIn: 88_001, tokensOut: 21_204, cost: 0.91, errors: 0, cache: 12, p50: 3.1, p95: 11.2, created: 'Sep 19, 2026' },
  { id: 'u3', email: 'grace@example.com', name: 'Grace Hopper', role: 'Member', runs: 0, tokensIn: 0, tokensOut: 0, cost: 0, errors: 0, cache: 0, p50: 0, p95: 0, created: 'Oct 1, 2026' },
  { id: 'u4', email: 'linus@example.com', name: 'Linus T.', role: 'Member', runs: 1_204, tokensIn: 9_402_118, tokensOut: 3_120_990, cost: 104.2, errors: 41, cache: 38, p50: 2.2, p95: 8.9, created: 'Aug 11, 2026' },
]

export const APPLICATIONS = [
  { id: 'a1', role: 'Senior Backend Engineer, Platform', company: 'Northwind Labs', stage: 'Interview', tone: 'accent' as const, fit: 92, next: 'Prepare for technical round', age: '2 days ago' },
  { id: 'a2', role: LONG_TITLE, company: 'Fernhill Systems', stage: 'Applied', tone: 'neutral' as const, fit: 74, next: 'Due Oct 12', age: '1 week ago' },
  { id: 'a3', role: 'Engineering Manager', company: 'Tidewater', stage: 'Saved', tone: 'neutral' as const, fit: null, next: null, age: 'Today' },
]

export const compact = (value: number) =>
  new Intl.NumberFormat('en', { notation: value >= 100_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value)
