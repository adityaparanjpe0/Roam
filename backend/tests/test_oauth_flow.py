"""Finite lifetimes and capacity use an injected clock, never sleeps."""

from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
from threading import Barrier

import pytest

from app.core.oauth_flow import InvalidLoginFlow, LoginFlowStore


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


def test_bad_state_does_not_consume_the_legitimate_attempt() -> None:
    store = LoginFlowStore(clock=lambda: 0)
    store.save(
        "browser",
        state="state",
        nonce="nonce",
        code_verifier="verifier",
        redirect_uri="http://127.0.0.1:5173/auth/google/callback",
        previous_browser_token=None,
    )
    with pytest.raises(InvalidLoginFlow):
        store.consume("browser", "wrong")
    assert store.consume("browser", "state").nonce == "nonce"


def test_concurrent_callback_consumption_has_exactly_one_winner() -> None:
    store = LoginFlowStore(clock=lambda: 0)
    store.save(
        "browser",
        state="state",
        nonce="nonce",
        code_verifier="verifier",
        redirect_uri="http://127.0.0.1:5173/auth/google/callback",
        previous_browser_token=None,
    )
    barrier = Barrier(2)

    def consume(_: int) -> bool:
        barrier.wait(timeout=5)
        try:
            store.consume("browser", "state")
            return True
        except InvalidLoginFlow:
            return False

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(consume, [0, 1])) == [False, True]
