import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isR11EvidenceProfileEnabled,
  isR12CvStudioEnabled,
  isR13CampaignsEnabled,
  isR14DiscoveryEnabled,
  isR15QueueEnabled,
  isR16SubmissionFoundationEnabled,
  isR17DevelopmentLoopEnabled,
} from '#/lib/flags/featureFlags'

const FLAGS = [
  'VITE_R11_EVIDENCE_PROFILE_ENABLED',
  'VITE_R12_CV_STUDIO_ENABLED',
  'VITE_R13_CAMPAIGNS_ENABLED',
  'VITE_R14_DISCOVERY_ENABLED',
  'VITE_R15_QUEUE_ENABLED',
  'VITE_R16_SUBMISSION_FOUNDATION_ENABLED',
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
    expect(isR16SubmissionFoundationEnabled()).toBe(false)
    expect(isR17DevelopmentLoopEnabled()).toBe(false)
  })

  it('requires the full upstream chain before exposing a downstream outcome', () => {
    for (const flag of FLAGS) vi.stubEnv(flag, 'true')
    expect(isR17DevelopmentLoopEnabled()).toBe(true)

    vi.stubEnv('VITE_R13_CAMPAIGNS_ENABLED', 'false')
    expect(isR13CampaignsEnabled()).toBe(false)
    expect(isR14DiscoveryEnabled()).toBe(false)
    expect(isR17DevelopmentLoopEnabled()).toBe(false)
  })
})
