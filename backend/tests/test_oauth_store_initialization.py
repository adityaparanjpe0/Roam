"""Concurrent request startup must use one process-local OAuth flow store."""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest

from app.api import auth
from app.core.oauth_flow import LoginFlowStore


def test_overlapping_first_access_keeps_both_attempts_available(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(auth, "_login_flow_store", LoginFlowStore())
    constructing = Barrier(2)

    def overlapping_constructor() -> LoginFlowStore:
        store = LoginFlowStore()
        constructing.wait(timeout=5)
        return store

    # Deterministically expose any lazy per-request initialization race.
    monkeypatch.setattr(auth, "LoginFlowStore", overlapping_constructor)
    with ThreadPoolExecutor(max_workers=2) as pool:
        stores = list(pool.map(lambda _: auth.get_login_flow_store(), range(2)))
    assert stores[0] is stores[1]
    for index, store in enumerate(stores):
        store.save(
            f"binding-{index}",
            state=f"state-{index}",
            nonce=f"nonce-{index}",
            code_verifier="verifier",
            redirect_uri="http://127.0.0.1:5173/auth/google/callback",
            previous_browser_token=None,
        )
    for index in range(2):
        flow = auth.get_login_flow_store().consume(f"binding-{index}", f"state-{index}")
        assert flow.nonce == f"nonce-{index}"
