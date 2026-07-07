import { expect, test } from '@playwright/test'

const apiUrl = `http://127.0.0.1:${process.env.E2E_BACKEND_PORT ?? '8000'}/api/v1`

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

Skills
Python, FastAPI, PostgreSQL, SQLAlchemy, React, TypeScript, Docker, CI/CD, AWS
`.trim()

type Sample = {
  status: number
  durationMs: number
}

async function measure(
  samples: number,
  warmup: () => Promise<{ status: number }>,
  call: () => Promise<{ status: number }>,
): Promise<Sample[]> {
  const warmupResponse = await warmup()
  expect(warmupResponse.status, 'warmup response status').toBe(200)

  const measurements: Sample[] = []

  for (let i = 0; i < samples; i += 1) {
    const start = performance.now()
    const response = await call()
    measurements.push({
      status: response.status,
      durationMs: performance.now() - start,
    })
  }

  return measurements
}

function percentile(samples: Sample[], percentileValue: number) {
  const sorted = samples.map((sample) => sample.durationMs).sort((a, b) => a - b)
  const index = Math.min(
    sorted.length - 1,
    Math.ceil(percentileValue * sorted.length) - 1,
  )
  return sorted[index]
}

function expectSuccessful(samples: Sample[], label: string) {
  expect(
    samples.map((sample) => sample.status),
    `${label}: response statuses`,
  ).toEqual(Array.from({ length: samples.length }, () => 200))
}

test('health endpoint p95 latency stays under the R4 baseline budget', async ({
  request,
}) => {
  const getHealth = async () => {
    const response = await request.get(`${apiUrl}/health`)
    return { status: response.status() }
  }
  const samples = await measure(7, getHealth, getHealth)

  expectSuccessful(samples, 'health')
  const p95 = percentile(samples, 0.95)
  expect(p95, `health p95 ${p95.toFixed(0)}ms`).toBeLessThan(500)
})

test('deterministic resume API p95 latency stays under the R4 baseline budget', async ({
  request,
}) => {
  test.setTimeout(30_000)

  const analyzeResume = async () => {
    const response = await request.post(`${apiUrl}/resume/analyze`, {
      data: { resume_text: resumeText },
    })
    return { status: response.status() }
  }
  const samples = await measure(5, analyzeResume, analyzeResume)

  expectSuccessful(samples, 'resume/analyze')
  const p95 = percentile(samples, 0.95)
  expect(p95, `resume/analyze p95 ${p95.toFixed(0)}ms`).toBeLessThan(3000)
})
