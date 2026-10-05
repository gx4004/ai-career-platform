import { describe, expect, it } from 'vitest'
import { describeFailure } from '#/pages/admin/source-failure'

describe('describeFailure', () => {
  it('is null for a fetch that worked or never ran', () => {
    expect(describeFailure('ok')).toBeNull()
    expect(describeFailure(null)).toBeNull()
  })

  it('names the status when the outcome carries one', () => {
    expect(describeFailure('failed: HTTPStatusError 404')).toBe('404 - board not found')
    expect(describeFailure('failed: HTTPStatusError 503')).toBe("503 - the board's server is having trouble")
  })

  it('translates the recorded exception class', () => {
    expect(describeFailure('failed: HTTPStatusError')).toBe('The board answered with an error')
    expect(describeFailure('failed: ReadTimeout')).toBe('The board did not answer in time')
    expect(describeFailure('failed: ConnectError')).toBe('The board could not be reached')
    expect(describeFailure('failed: JSONDecodeError')).toBe('The board answered with data we could not read')
    expect(describeFailure('failed: Mystery')).toBe('The fetch failed')
  })
})
