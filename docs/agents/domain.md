# Domain Documentation

Career Workbench uses a single domain context.

Before exploring or changing the product:

1. Read the root `CONTEXT.md` for shared terminology.
2. Read relevant accepted decisions in `docs/decisions.md`.
3. Read relevant ADRs under `docs/adr/` when that directory contains them.
4. Follow the source-of-truth precedence in `AGENTS.md`.

Use terms from `CONTEXT.md` in issues, tests, implementation, and review. When a
needed concept is absent, verify it against canonical product documentation before
adding terminology. Surface conflicts with accepted decisions instead of silently
reversing them.

Create ADRs only for durable architectural decisions that are not already owned by
`docs/decisions.md`; do not duplicate a decision across both systems.
