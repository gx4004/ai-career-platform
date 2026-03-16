# Product QA Checklist

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
