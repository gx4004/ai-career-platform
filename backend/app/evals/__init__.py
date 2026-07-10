"""Output Quality Program (R8) evaluation harness.

Houses the hand-authored synthetic fixture corpus (``fixtures/``) and the loader
that reads it into typed objects. Fixtures are never sampled, anonymized, or
derived from real user ``ToolRun`` content (see docs/decisions.md D-041 and
docs/adr/0002-r8-eval-fixture-data-source.md).
"""

from app.evals.loader import EvalFixture, FIXTURES_DIR, load_fixtures

__all__ = ["EvalFixture", "FIXTURES_DIR", "load_fixtures"]
