"""TEMPORARY diagnostic for #288 — must not be merged."""

import importlib
import pkgutil
import sys


def test_diag_router_population(client):
    import app.main as direct
    import app.routers

    print("\n=== #288 DIAG 2 ===")
    print("app.main file:", direct.__file__)
    print("app route count:", len(direct.app.routes))
    print("same object:", direct.app is client.app)

    total = 0
    for info in sorted(pkgutil.iter_modules(app.routers.__path__), key=lambda m: m.name):
        name = f"app.routers.{info.name}"
        mod = sys.modules.get(name)
        state = "already-imported" if mod else "not-imported"
        if mod is None:
            mod = importlib.import_module(name)
        count = len(getattr(getattr(mod, "router", None), "routes", []) or [])
        total += count
        print(f"  {info.name}: {count} routes ({state})")
    print("sum of router routes:", total)

    mounted = sorted({getattr(r, "path", "?") for r in direct.app.routes})
    print("mounted paths:", mounted)
    print("=== END DIAG 2 ===")

    raise AssertionError("diagnostic output above (#288)")
