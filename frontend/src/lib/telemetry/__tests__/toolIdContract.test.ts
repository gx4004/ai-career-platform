import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BROWSER_TOOL_IDS } from '#/lib/telemetry/client'

// The backend browser-ingest contract forbids unknown fields and validates
// `tool_id` against a narrow enum, so a member present on one side only means
// either events the backend rejects with a 422 the client never reads, or an id
// the backend accepts that no browser can legitimately produce.
//
// Neither list is duplicated here: this side imports the real runtime list the
// TelemetryPayload type is derived from, and the backend side is parsed out of
// the real Python source.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..')
const backendSchemaPath = resolve(repoRoot, 'backend/app/schemas/telemetry.py')

function backendBrowserToolIds(): string[] {
  const source = readFileSync(backendSchemaPath, 'utf8')
  const match = source.match(/^BrowserToolId = Literal\[$(?<members>[\s\S]*?)^\]$/m)
  expect(
    match?.groups?.members,
    `BrowserToolId not found in ${backendSchemaPath}. The browser ingest contract ` +
      'must stay a readable Literal block so this check cannot go vacuous.',
  ).toBeDefined()
  return [...(match!.groups!.members.matchAll(/"([^"]+)"/g))].map(m => m[1])
}

describe('browser telemetry tool_id contract', () => {
  it('agrees member for member with the backend BrowserToolId enum', () => {
    expect([...BROWSER_TOOL_IDS]).toEqual(backendBrowserToolIds())
  })

  it('reads a non-empty backend enum, so the comparison is not vacuous', () => {
    const backendIds = backendBrowserToolIds()

    expect(backendIds.length).toBeGreaterThanOrEqual(6)
    expect(backendIds).toContain('resume')
  })

  it('excludes backend-only pipeline ids the browser can never produce', () => {
    // `application-packet` is written only by the backend packet pipeline
    // (backend/app/services/application_packets.py PACKET_TOOL_NAME).
    expect(BROWSER_TOOL_IDS).not.toContain('application-packet')
    expect(readFileSync(backendSchemaPath, 'utf8')).toContain(
      'BackendOnlyToolId = Literal["application-packet"]',
    )
  })
})
