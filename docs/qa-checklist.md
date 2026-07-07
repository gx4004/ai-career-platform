# Product QA Checklist

> **HISTORICAL — kept for reference, not current authority.** Superseded by the
> acceptance gates in `docs/roadmap.md` and the verified R2/R4 baselines recorded
> in `docs/state.md`. Do not treat these items as present-day verification.

## Core Tool Coverage

- Resume analyzer renders score breakdown, issues, evidence, and top actions
- Job match renders requirement states, missing keywords, tailoring actions, and recruiter summary
- Cover letter renders structured sections, full draft, and customization notes
- Interview renders questions, answer structure, weak signals, and focus areas
- Career renders recommended direction, path comparison, skill gaps, and next steps
- Portfolio renders strategy, roadmap, recommended first project, and sequence plan

## Access Modes

- Guest demo runs work without saving to history
- Guest result pages clearly explain that sign-in is required for persistence
- Authenticated runs save to the workspace timeline

## Workflow Continuity

- `resume -> job-match -> cover-letter`
- `resume -> job-match -> interview`
- `resume -> career -> portfolio`
- Resume-later opens the expected next route

## History and Workspace

- Fresh authenticated runs appear in history
- Favorites toggle correctly
- Workspace pinning and relabeling work
- Deleted runs no longer load and show a clear unavailable state

## Exports and Reliability

- TXT and Markdown exports contain the important sections
- Editable blocks render where expected
- Tool failures show readable errors
- Route/render crashes show the error boundary state instead of a blank screen
