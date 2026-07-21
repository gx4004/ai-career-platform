"""TEMPORARY diagnostic for #288 — must not be merged."""

from collections import Counter


def test_diag_route_types(client):
    import fastapi
    import starlette

    import app.main as direct

    print("\n=== #288 DIAG 3 ===")
    print("fastapi:", fastapi.__version__)
    print("starlette:", starlette.__version__)
    print("app route count:", len(direct.app.routes))
    types = Counter(type(r).__module__ + "." + type(r).__name__ for r in direct.app.routes)
    for name, count in sorted(types.items()):
        print(f"  {name}: {count}")
    sample = [r for r in direct.app.routes if not hasattr(r, "path")]
    print("no-path sample repr:", repr(sample[0]) if sample else "none")
    print("no-path sample attrs:", sorted(a for a in dir(sample[0]) if not a.startswith("_"))[:25] if sample else "none")
    print("=== END DIAG 3 ===")

    raise AssertionError("diagnostic output above (#288)")
