"""Finite lifetimes and capacity use an injected clock, never sleeps."""

from hashlib import sha256

from app.core.oauth_flow import LoginFlowStore


def test_expired_flows_are_pruned_before_capacity_check() -> None:
    now = [0.0]
    store = LoginFlowStore(capacity=1, clock=lambda: now[0])
    for token in ("first", "second"):
        store.save(
            token,
            state="test-state",
            nonce="test-nonce",
            code_verifier="test-verifier",
            redirect_uri="http://127.0.0.1:5173/auth/google/callback",
            previous_browser_token=None,
        )
        now[0] += 600
    assert len(store._pending) == 1
    assert sha256(b"second").digest() in store._pending
    assert "test-verifier" not in repr(store._pending)
