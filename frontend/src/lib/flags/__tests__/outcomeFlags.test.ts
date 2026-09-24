import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isR11EvidenceProfileEnabled,
  isR12CvStudioEnabled,
  isR13CampaignsEnabled,
  isR14DiscoveryEnabled,
  isR15QueueEnabled,
  isR17DevelopmentLoopEnabled,
} from '#/lib/flags/featureFlags'

const FLAGS = [
  'VITE_R11_EVIDENCE_PROFILE_ENABLED',
  'VITE_R12_CV_STUDIO_ENABLED',
  'VITE_R13_CAMPAIGNS_ENABLED',
  'VITE_R14_DISCOVERY_ENABLED',
  'VITE_R15_QUEUE_ENABLED',
  'VITE_R17_DEVELOPMENT_LOOP_ENABLED',
] as const

afterEach(() => vi.unstubAllEnvs())

describe('build-ahead outcome flags', () => {
  it('keeps every outcome dark by default', () => {
    expect(isR11EvidenceProfileEnabled()).toBe(false)
    expect(isR12CvStudioEnabled()).toBe(false)
    expect(isR13CampaignsEnabled()).toBe(false)
    expect(isR14DiscoveryEnabled()).toBe(false)
    expect(isR15QueueEnabled()).toBe(false)
    expect(isR17DevelopmentLoopEnabled()).toBe(false)
  })

  it('enables an outcome from its own flag alone, with every other outcome left off', () => {
    vi.stubEnv('VITE_R17_DEVELOPMENT_LOOP_ENABLED', 'true')
    expect(isR17DevelopmentLoopEnabled()).toBe(true)
    expect(isR11EvidenceProfileEnabled()).toBe(false)
    expect(isR12CvStudioEnabled()).toBe(false)
    expect(isR13CampaignsEnabled()).toBe(false)
    expect(isR14DiscoveryEnabled()).toBe(false)
    expect(isR15QueueEnabled()).toBe(false)
  })

  it('does not require any upstream outcome to be on', () => {
    for (const flag of FLAGS) vi.stubEnv(flag, 'true')
    expect(isR17DevelopmentLoopEnabled()).toBe(true)

    // Turning an earlier outcome off must not dark a later, independent one.
    vi.stubEnv('VITE_R13_CAMPAIGNS_ENABLED', 'false')
    expect(isR13CampaignsEnabled()).toBe(false)
    expect(isR14DiscoveryEnabled()).toBe(true)
    expect(isR15QueueEnabled()).toBe(true)
    expect(isR17DevelopmentLoopEnabled()).toBe(true)
  })

  it('turns each outcome on independently of the others', () => {
    vi.stubEnv('VITE_R12_CV_STUDIO_ENABLED', 'true')
    expect(isR12CvStudioEnabled()).toBe(true)
    expect(isR11EvidenceProfileEnabled()).toBe(false)
  })
})
