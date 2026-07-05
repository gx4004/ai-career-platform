# Issue Tracker: GitHub

Issues and PRDs for this repository live in GitHub Issues. Run `gh` commands from
this clone so the `origin` remote selects `gx4004/ai-career-platform`.

## Conventions

- Create: `gh issue create --title "..." --body-file <path>`.
- Read: `gh issue view <number> --comments`.
- List: `gh issue list --state open --json number,title,body,labels,url`.
- Update labels: `gh issue edit <number> --add-label "<label>"`.
- Comment: `gh issue comment <number> --body "..."`.
- Close: `gh issue close <number> --comment "..."`.

Use a temporary file for substantial issue bodies so Markdown remains readable and
shell quoting is predictable. PRDs may live in canonical repository documentation
when they define a durable contract; implementation slices live as issues.

## Pull Requests as a Triage Surface

External pull requests are **not** a request surface. Triage incoming GitHub Issues.
Review pull requests through the repository's normal review flow without treating
them as feature-request tickets.

GitHub shares numbering between issues and pull requests. If a bare reference is
ambiguous, try `gh pr view <number>` and then `gh issue view <number>`.

## Skill Translation

- “Publish to the issue tracker” means create a GitHub issue.
- “Fetch the relevant ticket” means run `gh issue view <number> --comments`.
- “Apply a triage role” means use the mapped label in
  `docs/agents/triage-labels.md`.
