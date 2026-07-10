# 0006. CV documents are structured entities referencing Evidence Profile facts

**Status:** accepted
**Date:** 2026-07-10

## Context

R12 CV Studio requires a user to import, create, edit, score, tailor, version,
preview, and export an ATS-aware CV in the browser. Nothing in the current system
can hold that: document parsing produces flat extracted text only, `ToolRun` rows
are immutable single-shot result snapshots with a linear `parent_run_id` lineage
and no editing semantics, result views render read-only server JSON, and no DOCX
generation, template system, or print/page-break handling exists anywhere.

R11 (ADR 0005) establishes the Evidence Profile as the persisted, user-confirmed
factual record. A CV is not that record: which facts appear, how they are phrased,
ordered, grouped, and laid out for a specific role are editorial choices that must
persist and be versioned independently of the facts themselves.

## Decision

The CV is its own persisted, per-user structured document entity: typed sections
and entries whose factual claims reference Evidence Profile items rather than
duplicating them as unverifiable free text. Each document has one editable working
draft plus immutable, recoverable variant snapshots (the base and every
role-specific variant remain restorable). Preview, DOCX, and PDF all render
deterministically from this one structured source combined with a declarative
template definition; there is no separate export document. Tailoring writes to the
document only through diff-reviewed changes that carry requirement and evidence
provenance, and a claim without confirmed supporting evidence enters the document
only through an explicit user confirmation step.

## Alternatives Considered

- **Store CVs as `ToolRun` payloads** — rejected: runs are immutable single-shot
  snapshots; modeling an editing session as a run per keystroke or per save would
  explode history semantics and break the append-only auditability contract.
- **A freeform rich-text document** — rejected: the roadmap gate explicitly
  excludes a freeform document-editor dependency; free text cannot carry per-claim
  evidence references, deterministic template rendering, or ATS structural
  validation.
- **Generate CVs on demand from the Evidence Profile with no document entity** —
  rejected: selection, ordering, phrasing, and layout are durable user editorial
  work; regenerating them from facts alone would discard it on every render.
- **Client-side document state exported from the browser** — rejected: deterministic
  DOCX/PDF output, re-import verification, variant recovery, and the deletion
  cascade all require the server to own the canonical document.

## Consequences

- A second sensitive-content store (beyond the profile) joins the deletion cascade,
  export surface, threat model, and lifecycle reasoning before implementation.
- The Pydantic/Zod mirror obligation grows by a document schema family shared by
  the editor, scoring, tailoring, and both exporters.
- Evidence references keep fabrication checkable: a claim in the document either
  points at a confirmed profile item or is explicitly user-confirmed.
- R11 must land first; the profile item shape must be stable enough to be
  referenced by document entries (D-068 sequencing).
- Rollback posture: nothing ships before R11; after implementation the studio is
  additive — the six existing tools never depend on CV documents, so disabling the
  surface removes capability without touching their behavior.
