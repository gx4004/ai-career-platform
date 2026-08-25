"""PostgreSQL query-plan evidence for the owner-scoped run listings (#141 AC2).

Seeds representative synthetic volume into a disposable database, captures the
SQL that ``list_history``, ``list_workspaces`` and the admin ``list_runs``
handlers actually emit, and reports ``EXPLAIN (ANALYZE, BUFFERS)`` facts for
every one of those statements at two volumes.

This script only measures. It never creates an index, edits a model or rewrites
a query — #141 AC2 wants the plans on the table *before* anyone chooses an
index, and a harness that quietly tunes the schema cannot supply that evidence.

The assertions record today's plans as a baseline. A failure means the plan
shape moved (an index stopped being chosen, an estimate drifted away from
reality, or a sort spilled to disk) and wants a human decision, not a silent
re-record.

Run against an explicitly named disposable database, which this script creates
and drops for you::

    DATABASE_URL=postgresql+psycopg2:///cw_query_plans_20260825 \
      python tests/postgres_history_query_plans.py
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session, sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models.user import User
from app.routers.admin import list_runs
from app.routers.history import list_history, list_workspaces

_DATABASE_PREFIX = "cw_query_plans_"
_SAFE_IDENTIFIER = re.compile(r"^[a-z0-9_]+$")
_BACKEND_ROOT = Path(__file__).resolve().parents[1]

# Volume roughly one order of magnitude above anything the demo database holds,
# so the planner has to make the same choices it would make on a busy Railway
# Postgres rather than the "everything fits in one page" choices it makes on a
# fixture-sized table.
_USER_COUNT = 200
_WORKSPACES_PER_USER = 6
_BASELINE_RUNS_PER_USER = 10
_LOADED_RUNS_PER_USER = 250
_PROBE_USER_ID = "plan-user-042"

# An estimate an order of magnitude away from the measured rows is how a good
# index quietly stops being chosen, so that is the bound worth failing on.
_ESTIMATE_TOLERANCE = 10

_INDEX_SCAN_NODES = {"Index Scan", "Index Only Scan", "Bitmap Heap Scan"}

# Reported with the plans: the same query plans differently under a different
# work_mem or parallel budget, so evidence that omits them is not reproducible.
_REPORTED_SETTINGS = (
    "server_version",
    "shared_buffers",
    "work_mem",
    "effective_cache_size",
    "random_page_cost",
    "max_parallel_workers_per_gather",
)

_SEED_USERS_SQL = text(
    """
    INSERT INTO users (id, email, hashed_password, full_name, google_id,
                       is_active, is_admin, token_version, created_at)
    SELECT
        'plan-user-' || to_char(u, 'FM000'),
        'plan-user-' || to_char(u, 'FM000') || '@example.invalid',
        NULL, NULL, NULL, true, false, 0,
        now() - (u * interval '1 hour')
    FROM generate_series(0, :last_user) AS u
    """
)

_SEED_WORKSPACES_SQL = text(
    """
    INSERT INTO workspaces (id, user_id, label, discovery_listing_id, is_pinned,
                            company, role, status, deadline, reminders_enabled,
                            created_at, updated_at)
    SELECT
        'plan-ws-' || to_char(u, 'FM000') || '-' || w,
        'plan-user-' || to_char(u, 'FM000'),
        'Campaign ' || w,
        NULL,
        (w = 0),
        'Company ' || w,
        'Role ' || w,
        'applied',
        NULL,
        false,
        now() - ((u * :per_user + w) * interval '1 hour'),
        now() - ((u * :per_user + w) * interval '1 minute')
    FROM generate_series(0, :last_user) AS u,
         generate_series(0, :last_workspace) AS w
    """
)

# Set-based seeding: 50,000 ORM inserts would dominate the runtime of a script
# whose whole output is a plan, and the plans only care about the table's shape,
# not about how the rows got there.
_SEED_RUNS_SQL = text(
    """
    INSERT INTO tool_runs (id, user_id, workspace_id, tool_name, label, is_favorite,
                           result_payload, parent_run_id, feedback_text, created_at)
    SELECT
        'plan-run-' || to_char(u, 'FM000') || '-' || r,
        'plan-user-' || to_char(u, 'FM000'),
        CASE WHEN r % 3 = 0 THEN NULL
             ELSE 'plan-ws-' || to_char(u, 'FM000') || '-' || (r % :workspaces_per_user) END,
        (ARRAY['resume', 'job-match', 'career-path',
               'cover-letter', 'interview', 'portfolio'])[1 + (r % 6)],
        (ARRAY['Senior Backend Engineer at Acme', 'Platform Engineer at Globex',
               'Data Engineer at Initech', 'Frontend Engineer at Umbrella',
               'Site Reliability Engineer at Soylent', 'Product Analyst at Hooli',
               'Machine Learning Engineer at Stark', 'Solutions Architect at Wayne'
              ])[1 + (r % 8)],
        (r % 11 = 0),
        ('{"summary": "' || repeat('synthetic result payload ', 20)
            || '", "score": ' || (40 + r % 60) || '}')::json,
        NULL, NULL,
        now() - ((u * :runs_per_user + r) * interval '1 minute')
    FROM generate_series(0, :last_user) AS u,
         generate_series(:first_run, :last_run) AS r
    """
)


@dataclass(frozen=True)
class Scenario:
    """One handler call, plus where its query code lives."""

    name: str
    source: str
    invoke: Callable[[Session, User], object]


@dataclass(frozen=True)
class Recorded:
    """The plan facts measured today, which the assertions hold the plan to."""

    scan: str
    sort: str = "none"
    # Raised only where the planner is measurably wrong today; the note says why
    # and the report prints it, so a known-bad estimate stays visible instead of
    # disappearing into a loose global bound.
    estimate_error: int = _ESTIMATE_TOLERANCE
    note: str = ""


@dataclass(frozen=True)
class Measurement:
    scenario: str
    position: int
    descriptor: str
    relation: str
    node_type: str
    scan_kind: str
    index_name: str
    plan_rows: int
    actual_rows: int
    loops: int
    sort_methods: tuple[str, ...]
    execution_ms: float
    shared_hit: int
    shared_read: int

    @property
    def key(self) -> tuple[str, int]:
        return (self.scenario, self.position)

    @property
    def label(self) -> str:
        return f"{self.scenario} #{self.position + 1} ({self.descriptor})"

    @property
    def scan_summary(self) -> str:
        if self.index_name:
            return f"{self.node_type} using {self.index_name} on {self.relation}"
        return f"{self.node_type} on {self.relation}"

    @property
    def sort_state(self) -> str:
        if not self.sort_methods:
            return "none"
        if any("external" in method.lower() for method in self.sort_methods):
            return "external"
        return "in_memory"

    @property
    def estimate_error(self) -> float:
        low = min(self.plan_rows, self.actual_rows)
        high = max(self.plan_rows, self.actual_rows)
        return high / max(1, low)


# The admin route is wrapped by the shared rate limiter, which needs a live
# Request to derive its key. The unwrapped handler is the query code #141 is
# about, and it never touches `request`.
_admin_list_runs = list_runs.__wrapped__

_SCENARIOS: tuple[Scenario, ...] = (
    Scenario(
        name="history_list",
        source="app/routers/history.py:list_history",
        invoke=lambda session, user: list_history(
            page=1, page_size=12, current_user=user, db=session
        ),
    ),
    Scenario(
        name="history_list_last_page",
        source="app/routers/history.py:list_history (deep OFFSET)",
        invoke=lambda session, user: list_history(
            page=21, page_size=12, current_user=user, db=session
        ),
    ),
    Scenario(
        name="history_list_search",
        source="app/routers/history.py:list_history (label ILIKE)",
        invoke=lambda session, user: list_history(
            q="Engineer", page=1, page_size=12, current_user=user, db=session
        ),
    ),
    Scenario(
        name="workspace_list",
        source="app/routers/history.py:list_workspaces",
        invoke=lambda session, user: list_workspaces(
            limit=100, current_user=user, db=session
        ),
    ),
    Scenario(
        name="admin_runs",
        source="app/routers/admin.py:list_runs",
        invoke=lambda session, user: _admin_list_runs(
            request=None, page=1, page_size=20, tool=None, user_id=None,
            admin=user, db=session,
        ),
    ),
    Scenario(
        name="admin_runs_deep_page",
        source="app/routers/admin.py:list_runs (deep OFFSET)",
        invoke=lambda session, user: _admin_list_runs(
            request=None, page=500, page_size=20, tool=None, user_id=None,
            admin=user, db=session,
        ),
    ),
    Scenario(
        name="admin_runs_by_tool",
        source="app/routers/admin.py:list_runs (tool filter)",
        invoke=lambda session, user: _admin_list_runs(
            request=None, page=1, page_size=20, tool="resume", user_id=None,
            admin=user, db=session,
        ),
    ),
)

# How many statements each handler emits. A change here is an N+1 appearing or
# an eager load being dropped, both of which matter more than any single plan.
_EXPECTED_STATEMENT_COUNTS = {
    "history_list": 4,
    "history_list_last_page": 4,
    "history_list_search": 4,
    "workspace_list": 2,
    "admin_runs": 3,
    "admin_runs_deep_page": 3,
    "admin_runs_by_tool": 3,
}

# Plans measured at 200 owners x 250 runs on PostgreSQL 16 with stock planner
# settings. "sequential" and "external" entries are not approval — they are the
# measured cost #141 has to weigh an index against.
_CORRELATED_PREDICATES = (
    "planner multiplies user_id and workspace_id selectivity as if independent, "
    "but every campaign belongs to exactly one owner"
)
_RECORDED_PLANS: dict[tuple[str, int], Recorded] = {
    ("history_list", 0): Recorded(scan="index"),
    ("history_list", 1): Recorded(scan="index", sort="in_memory"),
    ("history_list", 2): Recorded(scan="index"),
    ("history_list", 3): Recorded(
        scan="index", sort="in_memory", estimate_error=200, note=_CORRELATED_PREDICATES
    ),
    ("history_list_last_page", 0): Recorded(scan="index"),
    ("history_list_last_page", 1): Recorded(scan="index", sort="in_memory"),
    ("history_list_last_page", 2): Recorded(scan="index"),
    ("history_list_last_page", 3): Recorded(
        scan="index", sort="in_memory", estimate_error=200, note=_CORRELATED_PREDICATES
    ),
    ("history_list_search", 0): Recorded(scan="index"),
    ("history_list_search", 1): Recorded(scan="index", sort="in_memory"),
    ("history_list_search", 2): Recorded(scan="index"),
    ("history_list_search", 3): Recorded(
        scan="index", sort="in_memory", estimate_error=200, note=_CORRELATED_PREDICATES
    ),
    ("workspace_list", 0): Recorded(scan="index", sort="in_memory"),
    ("workspace_list", 1): Recorded(scan="index", sort="in_memory"),
    ("admin_runs", 0): Recorded(
        scan="sequential",
        note="unfiltered count reads every tool_runs page on every admin page view",
    ),
    ("admin_runs", 1): Recorded(
        scan="sequential",
        sort="in_memory",
        note="no index on tool_runs.created_at, so page 1 still sorts the whole table",
    ),
    ("admin_runs", 2): Recorded(scan="sequential"),
    ("admin_runs_deep_page", 0): Recorded(scan="sequential"),
    ("admin_runs_deep_page", 1): Recorded(
        scan="sequential",
        sort="external",
        note="OFFSET 9980 lifts the sort bound past work_mem and it spills to disk",
    ),
    ("admin_runs_deep_page", 2): Recorded(scan="sequential"),
    ("admin_runs_by_tool", 0): Recorded(scan="index"),
    ("admin_runs_by_tool", 1): Recorded(scan="index", sort="in_memory"),
    ("admin_runs_by_tool", 2): Recorded(scan="sequential"),
}


def _guarded_database_name(database_url: str) -> str:
    name = make_url(database_url).database or ""
    if not name.startswith(_DATABASE_PREFIX) or not _SAFE_IDENTIFIER.fullmatch(name):
        raise RuntimeError(
            f"Refusing ambiguous database {name!r}; this script drops the database "
            f"it measures, so the name must be a plain identifier starting with "
            f"{_DATABASE_PREFIX!r}"
        )
    return name


@contextmanager
def _disposable_database(database_url: str, name: str) -> Iterator[None]:
    """Create the measurement database, and drop it however the run ends."""
    maintenance_url = make_url(database_url).set(database="postgres")
    maintenance = create_engine(maintenance_url, isolation_level="AUTOCOMMIT")
    try:
        with maintenance.connect() as connection:
            connection.exec_driver_sql(f'DROP DATABASE IF EXISTS "{name}"')
            connection.exec_driver_sql(f'CREATE DATABASE "{name}"')
        try:
            yield
        finally:
            with maintenance.connect() as connection:
                connection.exec_driver_sql(f'DROP DATABASE IF EXISTS "{name}"')
    finally:
        maintenance.dispose()


def _migrate(database_url: str) -> None:
    """Measure the migrated schema, not the ORM's idea of it."""
    completed = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=_BACKEND_ROOT,
        env={**os.environ, "DATABASE_URL": database_url},
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        raise RuntimeError(f"alembic upgrade head failed:\n{completed.stderr}")


def _seed_owners(engine: Engine) -> None:
    with engine.begin() as connection:
        connection.execute(_SEED_USERS_SQL, {"last_user": _USER_COUNT - 1})
        connection.execute(
            _SEED_WORKSPACES_SQL,
            {
                "last_user": _USER_COUNT - 1,
                "last_workspace": _WORKSPACES_PER_USER - 1,
                "per_user": _WORKSPACES_PER_USER,
            },
        )


def _seed_runs(engine: Engine, *, first_run: int, last_run: int) -> None:
    with engine.begin() as connection:
        connection.execute(
            _SEED_RUNS_SQL,
            {
                "last_user": _USER_COUNT - 1,
                "first_run": first_run,
                "last_run": last_run,
                "runs_per_user": _LOADED_RUNS_PER_USER,
                "workspaces_per_user": _WORKSPACES_PER_USER,
            },
        )
    # Without fresh statistics the planner works from the previous volume, which
    # would make every estimate here a measurement of the harness instead.
    # pg_statistic rows are transactional, so this has to commit.
    with engine.begin() as connection:
        connection.exec_driver_sql("ANALYZE users")
        connection.exec_driver_sql("ANALYZE workspaces")
        connection.exec_driver_sql("ANALYZE tool_runs")


@contextmanager
def _captured_selects(engine: Engine) -> Iterator[list[tuple[str, object]]]:
    """Collect the SELECTs a handler emits, as the driver sees them.

    Taken at cursor level so expanding IN lists are already expanded and the
    statement can be handed straight to EXPLAIN.
    """
    captured: list[tuple[str, object]] = []

    def record(_connection, _cursor, statement, parameters, _context, _executemany):
        normalized = statement.lstrip().lower()
        # The handlers also record their own timing sample; that write is
        # instrumentation, not one of the read shapes under measurement.
        if normalized.startswith("select") and "analytics_events" not in normalized:
            captured.append((statement, parameters))

    event.listen(engine, "after_cursor_execute", record)
    try:
        yield captured
    finally:
        event.remove(engine, "after_cursor_execute", record)


def _nodes(node: dict) -> Iterator[dict]:
    yield node
    for child in node.get("Plans", []):
        yield from _nodes(child)


def _scan_kind(node_type: str) -> str:
    if node_type == "Seq Scan":
        return "sequential"
    if node_type in _INDEX_SCAN_NODES:
        return "index"
    return node_type.lower()


def _index_name(scan: dict) -> str:
    """The index behind a scan — a bitmap plan names it on the child node."""
    for node in _nodes(scan):
        if "Index Name" in node:
            return node["Index Name"]
    return ""


def _sort_methods(plan: dict) -> tuple[str, ...]:
    methods: list[str] = []
    for node in _nodes(plan):
        if "Sort Method" in node:
            methods.append(node["Sort Method"])
        for worker in node.get("Workers", []):
            if "Sort Method" in worker:
                methods.append(worker["Sort Method"])
    return tuple(dict.fromkeys(methods))


def _describe(statement: str, relation: str) -> str:
    lowered = " ".join(statement.split()).lower()
    if lowered.startswith("select count("):
        return f"count over {relation}"
    if " limit " in lowered:
        return f"page of {relation}"
    return f"fan-out over {relation}"


def _explain(connection, statement: str, parameters: object) -> dict:
    result = connection.exec_driver_sql(
        f"EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) {statement}", parameters
    )
    payload = result.scalar_one()
    # psycopg2 decodes json columns but not this scalar on every version.
    return (json.loads(payload) if isinstance(payload, str) else payload)[0]


def _measure(engine: Engine, scenario: Scenario) -> list[Measurement]:
    Sessions = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    # A fresh session per scenario: the handlers commit their timing sample,
    # which expires the probe user and would otherwise add a reload statement
    # to whichever scenario happens to run next.
    with Sessions() as session:
        probe_user = session.query(User).filter(User.id == _PROBE_USER_ID).one()
        with _captured_selects(engine) as captured:
            scenario.invoke(session, probe_user)
        statements = list(captured)

    measurements: list[Measurement] = []
    with engine.connect() as connection:
        for position, (statement, parameters) in enumerate(statements):
            explained = _explain(connection, statement, parameters)
            plan = explained["Plan"]
            scans = [node for node in _nodes(plan) if "Relation Name" in node]
            if not scans:
                raise AssertionError(
                    f"{scenario.name} statement {position} produced no relation scan"
                )
            driving = scans[0]
            measurements.append(
                Measurement(
                    scenario=scenario.name,
                    position=position,
                    descriptor=_describe(statement, driving["Relation Name"]),
                    relation=driving["Relation Name"],
                    node_type=driving["Node Type"],
                    scan_kind=_scan_kind(driving["Node Type"]),
                    index_name=_index_name(driving),
                    plan_rows=int(driving["Plan Rows"]),
                    actual_rows=int(driving["Actual Rows"]),
                    loops=int(driving["Actual Loops"]),
                    sort_methods=_sort_methods(plan),
                    execution_ms=float(explained["Execution Time"]),
                    shared_hit=int(plan.get("Shared Hit Blocks", 0)),
                    shared_read=int(plan.get("Shared Read Blocks", 0)),
                )
            )
    return measurements


def _measure_all(engine: Engine) -> dict[tuple[str, int], Measurement]:
    measured: dict[tuple[str, int], Measurement] = {}
    for scenario in _SCENARIOS:
        for measurement in _measure(engine, scenario):
            measured[measurement.key] = measurement
    return measured


def _server_settings(engine: Engine) -> list[tuple[str, str]]:
    with engine.connect() as connection:
        return [
            (name, connection.exec_driver_sql(f"SHOW {name}").scalar_one())
            for name in _REPORTED_SETTINGS
        ]


def _report(
    settings: list[tuple[str, str]],
    baseline: dict[tuple[str, int], Measurement],
    loaded: dict[tuple[str, int], Measurement],
) -> None:
    baseline_rows = _USER_COUNT * _BASELINE_RUNS_PER_USER
    loaded_rows = _USER_COUNT * _LOADED_RUNS_PER_USER
    print(
        f"\nEXPLAIN (ANALYZE, BUFFERS) evidence — {_USER_COUNT} owners, "
        f"{_USER_COUNT * _WORKSPACES_PER_USER:,} campaigns, "
        f"tool_runs grown {baseline_rows:,} -> {loaded_rows:,} rows"
    )
    print("  " + "  ".join(f"{name}={value}" for name, value in settings))
    print(
        f"  timings are EXPLAIN ANALYZE execution time before "
        f"({baseline_rows:,} runs) and after ({loaded_rows:,} runs) the growth\n"
    )
    for scenario in _SCENARIOS:
        print(f"{scenario.name}  ({scenario.source})")
        positions = sorted(
            position for name, position in loaded if name == scenario.name
        )
        for position in positions:
            measurement = loaded[(scenario.name, position)]
            recorded = _RECORDED_PLANS.get((scenario.name, position))
            before = baseline.get((scenario.name, position))
            before_ms = f"{before.execution_ms:8.3f}" if before else "     n/a"
            sort = ", ".join(measurement.sort_methods) or "none"
            print(f"  #{position + 1}  {measurement.descriptor}")
            print(
                f"        scan     {measurement.scan_summary}  "
                f"({measurement.scan_kind})"
            )
            print(
                f"        rows     estimated {measurement.plan_rows:,} / "
                f"actual {measurement.actual_rows:,} per loop "
                f"x {measurement.loops} loop(s) — "
                f"{measurement.estimate_error:.0f}x off"
            )
            print(f"        sort     {sort}")
            print(
                f"        buffers  {measurement.shared_hit:,} hit / "
                f"{measurement.shared_read:,} read"
            )
            print(
                f"        exec ms  {before_ms} before -> "
                f"{measurement.execution_ms:8.3f} after"
            )
            if recorded is not None and recorded.note:
                print(f"        note     {recorded.note}")
        print()


def _assert_plan_facts(loaded: dict[tuple[str, int], Measurement]) -> None:
    emitted: dict[str, int] = {}
    for name, _position in loaded:
        emitted[name] = emitted.get(name, 0) + 1
    assert emitted == _EXPECTED_STATEMENT_COUNTS, (
        f"statement count per handler changed: {emitted} != "
        f"{_EXPECTED_STATEMENT_COUNTS}"
    )
    assert set(loaded) == set(_RECORDED_PLANS), (
        f"measured shapes changed: {sorted(set(loaded) ^ set(_RECORDED_PLANS))}"
    )

    for key, recorded in _RECORDED_PLANS.items():
        measurement = loaded[key]
        assert measurement.scan_kind == recorded.scan, (
            f"{measurement.label} now drives off a {measurement.scan_kind} scan "
            f"({measurement.scan_summary}); the recorded plan is {recorded.scan}. "
            f"Re-record only with an owner decision — choosing an index is gated "
            f"on #141's accepted budgets."
        )

        # Every scan measured here feeds an aggregate or a blocking sort, so the
        # driving node runs to completion and its estimate is comparable.
        assert measurement.estimate_error <= recorded.estimate_error, (
            f"{measurement.label} estimate is {measurement.estimate_error:.0f}x "
            f"from reality (estimated {measurement.plan_rows:,}, actual "
            f"{measurement.actual_rows:,}); the recorded bound is "
            f"{recorded.estimate_error}x"
        )

        # Only degradations fail: a sort that stops spilling is the outcome #141
        # is after and must not read as a broken gate.
        if recorded.sort == "none":
            assert measurement.sort_state == "none", (
                f"{measurement.label} gained a sort "
                f"({', '.join(measurement.sort_methods)}); the recorded plan "
                f"sorts nothing"
            )
        else:
            assert not (
                measurement.sort_state == "external" and recorded.sort != "external"
            ), (
                f"{measurement.label} now sorts on disk "
                f"({', '.join(measurement.sort_methods)}); the recorded plan "
                f"sorts in memory"
            )


def main() -> None:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL must name an explicit disposable database")
    database_name = _guarded_database_name(database_url)

    with _disposable_database(database_url, database_name):
        _migrate(database_url)
        engine = create_engine(database_url)
        try:
            settings = _server_settings(engine)
            _seed_owners(engine)
            _seed_runs(engine, first_run=0, last_run=_BASELINE_RUNS_PER_USER - 1)
            baseline = _measure_all(engine)
            _seed_runs(
                engine,
                first_run=_BASELINE_RUNS_PER_USER,
                last_run=_LOADED_RUNS_PER_USER - 1,
            )
            loaded = _measure_all(engine)
        finally:
            engine.dispose()

    _report(settings, baseline, loaded)
    _assert_plan_facts(loaded)
    print(
        f"history query-plan evidence passed: {len(loaded)} statements explained "
        f"at {_USER_COUNT * _LOADED_RUNS_PER_USER:,} tool runs; "
        f"disposable database {database_name} dropped"
    )


if __name__ == "__main__":
    main()
