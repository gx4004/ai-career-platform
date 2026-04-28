"""Cache-key scoping invariants for `result_cache.compute_content_hash`.

Locks in the contract added in `tool_pipeline`: identical inputs must yield
*different* cache slots when the user_scope kwarg differs, so two authenticated
users (or guest + an authenticated user) never share a slot.
"""

from app.services.result_cache import compute_content_hash


def test_cache_key_changes_with_user_scope():
    base = compute_content_hash("resume", "alice resume", "junior backend role")
    user_a = compute_content_hash(
        "resume", "alice resume", "junior backend role", user_scope="user-a"
    )
    user_b = compute_content_hash(
        "resume", "alice resume", "junior backend role", user_scope="user-b"
    )
    guest = compute_content_hash(
        "resume", "alice resume", "junior backend role", user_scope="guest"
    )

    assert base != user_a
    assert user_a != user_b
    assert user_a != guest
    assert guest != user_b


def test_cache_key_stable_for_same_user_and_inputs():
    """Same scope + same inputs → same hash (idempotent)."""
    a = compute_content_hash("resume", "  Alice Resume  ", "Backend role", user_scope="user-x")
    b = compute_content_hash("resume", "alice resume", "backend role", user_scope="user-x")
    # The function lowercases + strips inputs, so these collapse.
    assert a == b


def test_cache_key_changes_with_inputs_for_same_user():
    """Within one user, different inputs → different hashes."""
    a = compute_content_hash("resume", "alice resume v1", "role", user_scope="user-x")
    b = compute_content_hash("resume", "alice resume v2", "role", user_scope="user-x")
    assert a != b
