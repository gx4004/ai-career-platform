import { setResumeCarry } from '#/lib/tools/resumeCarryStore'

/**
 * A made-up resume for trying the tools without uploading anything. The first line says so, and the
 * person in it does not exist. It is never written to the carry store (so it can not reach the Evidence
 * Profile import) and the resume row names it as a sample.
 */
export const SAMPLE_RESUME_TEXT = `SAMPLE RESUME (fictional person, for trying the tool)

Jordan Rivera
Backend Engineer
jordan.rivera@example.com | Austin, TX | linkedin.com/in/jordan-rivera-sample

SUMMARY
Backend engineer with 5 years of experience building APIs and data pipelines in Python and SQL for a logistics platform used by 40,000 drivers.

EXPERIENCE
Backend Engineer, Freightline (2022 - present)
- Rebuilt the route-assignment API in Python and FastAPI, cutting median response time from 480 ms to 140 ms.
- Moved nightly billing jobs to a queue-based pipeline on AWS, reducing failed runs by 85% and saving the finance team about 6 hours a week.
- Mentored 3 junior engineers and led the migration from a single Postgres instance to read replicas.

Software Engineer, Bluebird Analytics (2019 - 2022)
- Built REST endpoints and background workers handling 2 million events a day.
- Wrote integration tests that raised coverage from 38% to 81% and caught 12 regressions before release.
- Automated deployments with Docker and GitHub Actions, shortening releases from 2 days to 30 minutes.

SKILLS
Python, FastAPI, SQL, PostgreSQL, AWS, Docker, Redis, CI/CD, REST APIs, testing

EDUCATION
B.S. Computer Science, University of Texas at Austin, 2019
`

export function isSampleResume(text: string) {
  return text.trim() === SAMPLE_RESUME_TEXT.trim()
}

/**
 * Keep a resume the user supplied for the rest of this tab (Evidence Profile import, other tools). Sample text is never
 * kept. `origin` is the tool it was supplied on; text the tab already carries keeps the origin it had.
 */
export function rememberResume(text: string, filename?: string, origin?: string) {
  if (!text.trim() || isSampleResume(text)) return
  try {
    setResumeCarry(text, filename, origin)
  } catch {
    // sessionStorage unavailable (private mode, sandboxed): the draft and workflow context still carry it.
  }
}
