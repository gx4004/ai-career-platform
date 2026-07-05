# Career Workbench Domain Context

## Language
**Issue tracker**
The system that hosts repository work items. In this project, use GitHub Issues.

**Issue**
A single tracked unit of work (feature, bug, task, PRD slice) in the issue tracker.

**Triage role**
A canonical workflow label applied to an issue during triage (for example:
`needs-triage`, `ready-for-agent`).

## Product domain
AI-powered job-search workspace with six tools:
1. Resume Analyzer
2. Job Match
3. Career Path
4. Cover Letter
5. Interview Q&A
6. Portfolio Planner

## Current operating mode
Thesis demo mode: all results are visible and ad gating is bypassed.

## Branch roles

- `chapter2` is the long-lived product experimentation and hardening branch.
- `main` contains reviewed stable product changes.
- `deploy` is the stable Railway deployment branch.
- Short-lived work branches target `chapter2` until a release is promoted.
