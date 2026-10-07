import { readFileSync } from 'node:fs'
import path from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LandingFeatureStepsDemo } from '#/components/landing/LandingFeatureStepsDemo'
import { LandingSocialProof } from '#/components/landing/LandingSocialProof'

const landingCss = readFileSync(path.resolve(__dirname, '../../../styles/landing.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

describe('LandingFeatureStepsDemo', () => {
  it('renders the Review/Aim/Build workflow cards', () => {
    render(<LandingFeatureStepsDemo />)
    expect(screen.getByRole('heading', { name: /Review\. Aim\. Build\./i })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /^Review$/ })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /^Aim$/ })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /^Build$/ })).toBeTruthy()
  })

  it('says what the three steps do, in plain words', () => {
    render(<LandingFeatureStepsDemo />)
    expect(screen.getByText('Three steps from the resume you have to the applications you send.')).toBeTruthy()
  })

  // An inline --kit-tilt (the tilt prop) cannot be levelled by a media query, so the angles live in CSS
  // (sign-off public-F07: on tablets and phones only the seal, brand mark and stamps tilt, STICKER 1.15).
  it('leaves the step and note tilts to the stylesheet, which levels them at 860px and below', () => {
    const steps = render(<LandingFeatureStepsDemo />)
    for (const card of steps.container.querySelectorAll<HTMLElement>('.lp-workflow-card')) {
      expect(card.style.getPropertyValue('--kit-tilt')).toBe('')
    }
    const note = render(<LandingSocialProof />).container.querySelector<HTMLElement>('.lp-note')!
    expect(note.style.getPropertyValue('--kit-tilt')).toBe('')

    expect(landingCss).toMatch(/\.kit-sticker\.lp-workflow-card:nth-child\(1\)\s*\{[^}]*--kit-tilt:\s*-1\.4deg/)
    expect(landingCss).toMatch(/\.kit-sticker\.lp-workflow-card:nth-child\(2\)\s*\{[^}]*--kit-tilt:\s*1deg/)
    expect(landingCss).toMatch(/\.kit-sticker\.lp-workflow-card:nth-child\(3\)\s*\{[^}]*--kit-tilt:\s*-0\.8deg/)
    const narrow = landingCss.slice(landingCss.indexOf('@media (max-width: 860px)'))
    expect(narrow).toMatch(/\.kit-sticker\.lp-workflow-card:nth-child\(n\)\s*\{[^}]*--kit-tilt:\s*0deg/)
    expect(narrow).toMatch(/\.kit-sticker\.lp-note\s*\{[^}]*--kit-tilt:\s*0deg/)
  })
})
