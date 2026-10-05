import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Scan } from 'lucide-react'
import { FitStamp, NumberDisc, RoundStamp, SkillPips, StageMark, ToolTile, fitLevel } from '#/components/kit'
import { STAGE_TONE, STAGES } from '#/components/applications/stages'
import { toolList, tools } from '#/lib/tools/registry'

describe('registry tone', () => {
  it('gives every tool its colour: Resume tangerine, Match mint, Career lilac, Letter lemon, Interview rose, Portfolio aqua', () => {
    expect(Object.fromEntries(toolList.map((tool) => [tool.id, tool.tone]))).toEqual({
      resume: 'tangerine',
      'job-match': 'mint',
      career: 'lilac',
      'cover-letter': 'lemon',
      interview: 'rose',
      portfolio: 'aqua',
    })
  })
})

describe('kit ToolTile', () => {
  it('renders the tone and icon it is given (from the registry, passed by the caller), and is decorative', () => {
    const { container } = render(<ToolTile tone={tools['job-match'].tone} icon={tools['job-match'].icon} />)
    const tile = container.firstElementChild as HTMLElement
    expect(tile.getAttribute('data-tone')).toBe('mint')
    expect(tile.getAttribute('aria-hidden')).toBe('true')
    expect(tile.classList.contains('kit-tool-tile--md')).toBe(true)
    expect(tile.querySelector('svg')).not.toBeNull()
  })

  it('lets tone and icon override, and tilts only the lg mark by default', () => {
    const { container, rerender } = render(<ToolTile tone="rose" icon={Scan} size="sm" />)
    expect((container.firstElementChild as HTMLElement).getAttribute('data-tone')).toBe('rose')
    expect((container.firstElementChild as HTMLElement).style.getPropertyValue('--kit-tilt')).toBe('')
    rerender(<ToolTile tone="tangerine" icon={Scan} size="lg" />)
    expect((container.firstElementChild as HTMLElement).style.getPropertyValue('--kit-tilt')).toBe('-4deg')
    rerender(<ToolTile tone="tangerine" icon={Scan} size="lg" tilt={0} />)
    expect((container.firstElementChild as HTMLElement).style.getPropertyValue('--kit-tilt')).toBe('')
    rerender(<ToolTile tone="tangerine" icon={Scan} size="index" />)
    expect(container.firstElementChild!.classList.contains('kit-tool-tile--index')).toBe(true)
  })
})

describe('stage tones', () => {
  it('Saved lemon, Applied lilac, Interviewing tangerine, Offer mint, Closed stone', () => {
    expect(STAGE_TONE).toEqual({ saved: 'lemon', applied: 'lilac', interviewing: 'tangerine', offer: 'mint', closed: 'stone' })
    for (const stage of STAGES) expect(STAGE_TONE[stage.id]).toBeTruthy()
  })
})

describe('kit StageMark', () => {
  it('count: the number in a tone block, with hidden text for the name', () => {
    const { container } = render(<StageMark stage="interviewing" variant="count" count={3} label="Interviewing" />)
    const mark = container.firstElementChild as HTMLElement
    expect(mark.getAttribute('data-tone')).toBe('tangerine')
    expect(mark.getAttribute('data-variant')).toBe('count')
    expect(mark.getAttribute('data-digits')).toBe('1')
    expect(mark.querySelector('.kit-stage-mark__count')?.textContent).toBe('3')
    expect(mark.querySelector('.kit-sr-only')?.textContent).toBe('Interviewing')
  })

  it('count: three digits shrink the numeral', () => {
    const { container } = render(<StageMark stage="saved" variant="count" count={128} />)
    expect((container.firstElementChild as HTMLElement).getAttribute('data-digits')).toBe('3')
  })

  it('dot: no text unless a label is given', () => {
    const { container } = render(<StageMark stage="offer" variant="dot" />)
    const mark = container.firstElementChild as HTMLElement
    expect(mark.getAttribute('data-tone')).toBe('mint')
    expect(mark.textContent).toBe('')
  })

  it('badge (default): says the stage in words and carries the stage tone', () => {
    render(<StageMark stage="closed" />)
    const badge = screen.getByText('Closed').closest('.kit-badge') as HTMLElement
    expect(badge.getAttribute('data-tone')).toBe('stone')
  })
})

describe('kit NumberDisc', () => {
  it('is decorative and carries size and tone', () => {
    const { container } = render(<NumberDisc n={2} size="lg" tone="mint" />)
    const disc = container.firstElementChild as HTMLElement
    expect(disc.textContent).toBe('2')
    expect(disc.getAttribute('aria-hidden')).toBe('true')
    expect(disc.classList.contains('kit-number-disc--lg')).toBe(true)
    expect(disc.getAttribute('data-tone')).toBe('mint')
  })
})

describe('kit FitStamp', () => {
  it('mint from 80, lemon from 65, white below', () => {
    expect(fitLevel(94).tone).toBe('mint')
    expect(fitLevel(80).tone).toBe('mint')
    expect(fitLevel(79).tone).toBe('lemon')
    expect(fitLevel(65).tone).toBe('lemon')
    expect(fitLevel(64).tone).toBe('white')
    expect(fitLevel(70, { good: 90, fair: 70 }).tone).toBe('lemon')
  })

  it('is an image named by the fit, and rounds and clamps', () => {
    const { rerender } = render(<FitStamp value={94} />)
    expect(screen.getByRole('img', { name: '94% fit' }).getAttribute('data-tone')).toBe('mint')
    rerender(<FitStamp value={72.6} />)
    expect(screen.getByRole('img', { name: '73% fit' }).getAttribute('data-tone')).toBe('lemon')
    rerender(<FitStamp value={140} />)
    expect(screen.getByRole('img', { name: '100% fit' }).getAttribute('data-digits')).toBe('3')
    rerender(<FitStamp value={12} size="sm" />)
    const stamp = screen.getByRole('img', { name: '12% fit' })
    expect(stamp.getAttribute('data-tone')).toBe('white')
    expect(stamp.getAttribute('data-size')).toBe('sm')
  })

  it('says so when there is no fit', () => {
    render(<FitStamp value={null} />)
    const stamp = screen.getByRole('img', { name: 'Fit not available' })
    expect(stamp.textContent).toBe('–')
    expect(stamp.getAttribute('data-tone')).toBe('white')
  })
})

describe('kit SkillPips', () => {
  it('draws one pip per skill, the matched ones on', () => {
    const { container } = render(<SkillPips matched={5} total={7} />)
    const img = screen.getByRole('img', { name: '5 of 7 skills' })
    expect(img.querySelectorAll('.kit-skill-pips__pip')).toHaveLength(7)
    expect(container.querySelectorAll('.kit-skill-pips__pip[data-on="true"]')).toHaveLength(5)
  })

  it('caps at ten pips: more skills fall back to a small meter', () => {
    const { container } = render(<SkillPips matched={11} total={14} />)
    expect(container.querySelectorAll('.kit-skill-pips__pip')).toHaveLength(0)
    const meter = screen.getByRole('meter', { name: '11 of 14 skills' })
    expect(meter.getAttribute('aria-valuenow')).toBe('11')
    expect(meter.getAttribute('aria-valuemax')).toBe('14')
  })

  it('never has 40 pips, clamps matched to total, and renders nothing for zero skills', () => {
    const { container, rerender } = render(<SkillPips matched={99} total={3} />)
    expect(container.querySelectorAll('.kit-skill-pips__pip[data-on="true"]')).toHaveLength(3)
    expect(screen.getByRole('img', { name: '3 of 3 skills' })).toBeTruthy()
    rerender(<SkillPips matched={0} total={0} />)
    expect(container.firstElementChild).toBeNull()
    rerender(<SkillPips matched={1} total={10} max={5} />)
    expect(container.querySelectorAll('.kit-skill-pips__pip')).toHaveLength(0)
  })
})

describe('kit RoundStamp', () => {
  it('is an image with its label, mint for a rate above zero, stone for zero or text', () => {
    const { container, rerender } = render(<RoundStamp value={50} unit="%" label="Reply rate 50%" />)
    const stamp = screen.getByRole('img', { name: 'Reply rate 50%' })
    expect(stamp.getAttribute('data-tone')).toBe('mint')
    expect(stamp.textContent).toBe('50%')
    expect(stamp.style.getPropertyValue('--kit-tilt')).toBe('8deg')
    expect(stamp.style.getPropertyValue('--kit-stamp-size')).toBe('84px')
    rerender(<RoundStamp value={0} unit="%" label="Reply rate 0%" />)
    expect(screen.getByRole('img', { name: 'Reply rate 0%' }).getAttribute('data-tone')).toBe('stone')
    rerender(<RoundStamp value="n/a" label="Reply rate not available" tone="lilac" />)
    expect(container.firstElementChild!.getAttribute('data-tone')).toBe('lilac')
  })
})
