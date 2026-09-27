/**
 * Feature flags for experiments that stay off by default.
 *
 * Each flag reads its own `import.meta.env.VITE_*` variable (inlined at build
 * time). When the variable is unset or anything other than the string "true"
 * (case-insensitively, trimmed), the flag reads false.
 */

/** Parse a raw env value into a boolean. Only "true" enables; everything else, including undefined, is off. */
function readBooleanFlag(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true'
}

/** Autopilot experiment (#325): local-only browser form filling that stops before submit. */
export function isAutopilotExperimentEnabled(): boolean {
  return readBooleanFlag(import.meta.env.VITE_AUTOPILOT_EXPERIMENT_ENABLED)
}
