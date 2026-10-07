import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToolPageLoading } from '#/components/tooling/toolPageShared'

vi.mock('#/hooks/useSession', () => ({
  useSession: () => ({ status: 'guest', openAuthDialog: vi.fn() }),
}))
vi.mock('#/lib/telemetry/client', () => ({ trackTelemetry: vi.fn() }))

/**
 * The working panel takes the form's place on submit. On a phone the sticky app header covers the top of the viewport and
 * the floating tab tray its foot (tooling.css gives the panel scroll margins for both): a panel that lands under either is
 * brought to sit just under the header (sign-off tool-inputs-F25: /career at 375 landed at 54px, under the 70px header;
 * /resume at 320 ran to 606px of 640, Cancel under the tray).
 */
describe('ToolPageLoading: brings the working panel clear of the header and the tab tray', () => {
  const scrollIntoView = vi.fn()
  const realGetComputedStyle = window.getComputedStyle
  let rect = { top: 0, bottom: 0 }
  let margins = { top: '0px', bottom: '0px' }

  beforeEach(() => {
    scrollIntoView.mockReset()
    Element.prototype.scrollIntoView = scrollIntoView
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      () => ({ ...rect, left: 0, right: 0, width: 0, height: rect.bottom - rect.top, x: 0, y: rect.top, toJSON: () => ({}) }) as DOMRect,
    )
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
      const style = realGetComputedStyle(element, pseudo)
      if (!(element as Element).classList?.contains('tool-loading')) return style
      return new Proxy(style, {
        get: (target, key) =>
          key === 'scrollMarginTop' ? margins.top : key === 'scrollMarginBottom' ? margins.bottom : Reflect.get(target, key),
      })
    })
    window.innerHeight = 640
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete (Element.prototype as Partial<Element>).scrollIntoView
    window.innerHeight = 768
  })

  it('scrolls when the panel top sits under the app header, even though it is below 0', () => {
    margins = { top: '86px', bottom: '96px' }
    rect = { top: 54, bottom: 480 }
    render(<ToolPageLoading toolId="career" />)
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.calls[0][0]).toMatchObject({ block: 'start' })
  })

  it('scrolls when the panel foot (and Cancel) sits under the tab tray', () => {
    margins = { top: '86px', bottom: '96px' }
    rect = { top: 201, bottom: 606 }
    render(<ToolPageLoading toolId="resume" />)
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('leaves the page alone when the panel is already clear of both', () => {
    margins = { top: '16px', bottom: '0px' }
    rect = { top: 120, bottom: 470 }
    render(<ToolPageLoading toolId="job-match" />)
    expect(scrollIntoView).not.toHaveBeenCalled()
  })
})
