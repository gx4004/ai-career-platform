/**
 * Feature flags for build-ahead outcomes (R11–R17).
 *
 * Each candidate reads its own `import.meta.env.VITE_R1x_*` variable. Flags are
 * config-driven (a Vite env var, inlined at build time), so a candidate can be
 * flipped on or off by changing deploy configuration — not source.
 *
 * Default is OFF: when the variable is unset or anything other than the string
 * "true" (case-insensitively, trimmed), the flag reads false.
 */

/** Parse a raw env value into a boolean. Only "true" enables; everything else, including undefined, is off. */
function readBooleanFlag(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true'
}

/**
 * Provisional R11–R17 outcomes are built ahead but must remain dark until their
 * own accepted roadmap gate closes. Each outcome reads only its own
 * `VITE_R1x_*` variable — enabling one does not require any other outcome to
 * also be enabled, and turning one off does not dark any other outcome (#321,
 * Phase 1a). The backend enforces the same independent, per-outcome gate
 * authoritatively; a deployment mismatch just fails closed per-route (404),
 * it does not expose an incomplete chain.
 *
 * The one real data dependency — CV Studio's evidence-grounded tailoring
 * reads confirmed Evidence Profile (R11) items — is handled server-side: CV
 * Studio (R12) stays fully usable with R11 off, it just degrades the
 * evidence-grounded parts instead of failing.
 */
export function isR11EvidenceProfileEnabled(): boolean {
  return readBooleanFlag(import.meta.env.VITE_R11_EVIDENCE_PROFILE_ENABLED)
}

export function isR12CvStudioEnabled(): boolean {
  return readBooleanFlag(import.meta.env.VITE_R12_CV_STUDIO_ENABLED)
}

export function isR13CampaignsEnabled(): boolean {
  return readBooleanFlag(import.meta.env.VITE_R13_CAMPAIGNS_ENABLED)
}

export function isR14DiscoveryEnabled(): boolean {
  return readBooleanFlag(import.meta.env.VITE_R14_DISCOVERY_ENABLED)
}

export function isR15QueueEnabled(): boolean {
  return readBooleanFlag(import.meta.env.VITE_R15_QUEUE_ENABLED)
}

export function isR16SubmissionFoundationEnabled(): boolean {
  return readBooleanFlag(import.meta.env.VITE_R16_SUBMISSION_FOUNDATION_ENABLED)
}

export function isR17DevelopmentLoopEnabled(): boolean {
  return readBooleanFlag(import.meta.env.VITE_R17_DEVELOPMENT_LOOP_ENABLED)
}
