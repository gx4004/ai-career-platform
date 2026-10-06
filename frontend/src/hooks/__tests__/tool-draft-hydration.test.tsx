import { act } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { useToolDraft } from '#/hooks/useToolDraft'
import { useWorkflowBridge } from '#/hooks/useWorkflowBridge'
import { getDraftKey, writeWorkflowContext } from '#/lib/tools/drafts'

/** The parts of a tool page that read session storage: the saved draft and the carried workflow context. */
function Probe() {
  const { draft, setDraft } = useToolDraft('job-match')
  const bridge = useWorkflowBridge('job-match', draft, setDraft)
  return (
    <div>
      {bridge.seededResume || draft.resumeText.trim() ? <p>Resume ready</p> : <span>Drop a file</span>}
      <output>{draft.jobDescription}</output>
    </div>
  )
}

describe('tool page storage reads', () => {
  beforeAll(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })
  afterEach(() => sessionStorage.clear())

  it('hydrate without a mismatch when the tab already holds a draft and a carried context', async () => {
    // The server has no session storage: its HTML is the empty form.
    const html = renderToString(<Probe />)

    sessionStorage.setItem(getDraftKey('job-match'), JSON.stringify({ jobDescription: 'Saved job text' }))
    writeWorkflowContext({ resumeText: 'Carried resume text', updatedAt: Date.now() })

    const container = document.createElement('div')
    container.innerHTML = html
    document.body.appendChild(container)
    const onRecoverableError = vi.fn()

    await act(async () => {
      hydrateRoot(container, <Probe />, { onRecoverableError })
    })

    expect(onRecoverableError).not.toHaveBeenCalled()
    // ...and the stored values still arrive, right after mount.
    expect(container.textContent).toContain('Resume ready')
    expect(container.querySelector('output')?.textContent).toBe('Saved job text')
    container.remove()
  })
})
