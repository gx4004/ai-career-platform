/**
 * R7 dark-ship feature flags.
 *
 * R7 (First-Run and Continuity Improvements) ships each candidate experiment
 * "dark": built but inert, and individually enable-able, so nothing changes for
 * real users until the R6 baseline justifies turning a specific candidate on
 * (see PRD #109, decision D-049 for the dark-ship posture).
 *
 * Each candidate reads its own `import.meta.env.VITE_R7_*` variable. Flags are
 * config-driven (a Vite env var, inlined at build time), so a candidate can be
 * flipped on or off by changing deploy configuration — not source — and
 * independently of every other candidate: exactly the on/off toggle the PRD asks
 * for (A/B / experiment infrastructure is explicitly out of scope).
 *
 * Default is OFF: when the variable is unset or anything other than the string
 * "true" (case-insensitively, trimmed), the flag reads false.
 *
 * Sibling R7 tickets (#111–#115) should add their candidate's getter here,
 * following the same `VITE_R7_<CANDIDATE>` naming and default-off contract.
 */

/** Parse a raw env value into a boolean. Only "true" enables; everything else, including undefined, is off. */
function readBooleanFlag(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true'
}

/**
 * R7 candidate #110 — first-run entry choice (resume-first vs role-first).
 *
 * When off (default), the landing surface keeps its single generic CTA.
 * When on, the landing CTA becomes an explicit "I have a resume" / "I'm
 * targeting a role" choice that routes to Resume Analyzer or Job Match.
 */
export function isR7EntryChoiceEnabled(): boolean {
  return readBooleanFlag(import.meta.env.VITE_R7_ENTRY_CHOICE)
}

/**
 * R7 candidate #111 — sample resume / sample job-description quick-fill.
 *
 * When off (default), the dropzone/job-import inputs are unchanged: users must
 * upload, paste, or import their own content.
 * When on, a clearly-labeled "try a sample" affordance seeds the existing
 * paste-text path with synthetic sample content (no real user data), so a
 * first-time visitor can see what a tool does before trusting it with their own
 * resume or job description.
 */
export function isR7SampleQuickfillEnabled(): boolean {
  return readBooleanFlag(import.meta.env.VITE_R7_SAMPLE_QUICKFILL)
}

/**
 * R7 candidate #112 — context-carry field transparency and per-field clear.
 *
 * When off (default), the workflow handoff banner is unchanged: a single line
 * naming the source tool the current inputs were carried over from.
 * When on, the banner additionally names the specific fields carried over
 * (resume, job description, target role) and exposes a per-field control to
 * clear a specific carried field for the current tab, so it no longer pre-fills
 * the next tool's input. This stays within the existing tab-scoped
 * `sessionStorage` carry boundary (D-011) — no new persistence layer, no
 * cross-tab/cross-device carry.
 */
export function isR7ContextCarryEnabled(): boolean {
  return readBooleanFlag(import.meta.env.VITE_R7_CONTEXT_CARRY)
}

/**
 * R7 candidate #113 — next-best-action suggestion on completed results.
 *
 * When off (default), result screens are unchanged. When on, the result screen
 * exposes the same metadata-aware next-tool continuation used by history.
 */
export function isR7NextBestActionEnabled(): boolean {
  return readBooleanFlag(import.meta.env.VITE_R7_NEXT_BEST_ACTION)
}

/**
 * R7 candidate #114 — value-specific guest signup prompt.
 *
 * When off (default), the completed-result guest prompt keeps its existing
 * generic copy and behavior. When on, it names the tool result the guest would
 * keep while retaining the existing tool-scoped signup attribution.
 */
export function isR7ValueSpecificSignupEnabled(): boolean {
  return readBooleanFlag(import.meta.env.VITE_R7_VALUE_SPECIFIC_SIGNUP)
}

/**
 * R7 candidate #115 — in-app recent-results nudge.
 *
 * When off (default), dashboard and history render exactly as before. When on,
 * those surfaces may call attention to recent results that are not favorites.
 * The current history model does not persist export state, so this flag does
 * not imply that an export can be inferred or tracked.
 */
export function isR7ResultsNudgeEnabled(): boolean {
  return readBooleanFlag(import.meta.env.VITE_R7_RESULTS_NUDGE)
}
