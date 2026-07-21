"""TEMPORARY diagnostic for #288 — must not be merged.

Prints how app.main resolves under CI, from a direct import and from the
`client` fixture, to confirm or kill the duplicate-module theory.
"""

import sys


def test_diag_app_identity(client):
    import app.main as direct

    print("\n=== #288 DIAG ===")
    print("sys.path:", sys.path)
    print("direct __file__:", direct.__file__)
    print("direct id(app):", id(direct.app))
    print("direct route count:", len(direct.app.routes))
    print("client.app id:", id(client.app))
    print("client.app route count:", len(client.app.routes))
    print("same object:", direct.app is client.app)
    print("main-ish modules:", sorted(k for k in sys.modules if k.endswith("main")))
    print("app.routers path:", sys.modules["app.routers"].__path__)
    print("=== END DIAG ===")

    # Deliberate failure: pytest only surfaces captured stdout for failing tests,
    # and this branch exists solely to read that output. Never merged.
    raise AssertionError("diagnostic output above (#288)")
