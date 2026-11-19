"""Bounded, short-lived login attempts; these are NOT authenticated sessions."""

from collections.abc import Callable
from dataclasses import dataclass
from hashlib import sha256
from hmac import compare_digest
from threading import Lock
from time import monotonic

FLOW_TTL_SECONDS = 600


class LoginCapacityError(ValueError):
    """No live flow may be silently evicted to admit another browser."""


class InvalidLoginFlow(ValueError):
    """Expired, missing, mismatched, or already-consumed login attempt."""


@dataclass(frozen=True, repr=False)
class PendingLogin:
    state: str
    nonce: str
    code_verifier: str
    redirect_uri: str
    expires_at: float


class LoginFlowStore:
    """One-process initiation storage; restarts fail closed, no disk/DB writes.

    Callback consumption is atomic and single-use within this process.
    """

    def __init__(
        self,
        capacity: int = 256,
        clock: Callable[[], float] = monotonic,
    ) -> None:
        self._capacity = capacity
        self._clock = clock
        self._lock = Lock()
        self._pending: dict[bytes, PendingLogin] = {}

    def save(
        self,
        browser_token: str,
        *,
        state: str,
        nonce: str,
        code_verifier: str,
        redirect_uri: str,
        previous_browser_token: str | None,
    ) -> None:
        now = self._clock()
        key = sha256(browser_token.encode()).digest()
        with self._lock:
            self._pending = {
                key: flow
                for key, flow in self._pending.items()
                if flow.expires_at > now
            }
            if previous_browser_token and len(previous_browser_token) <= 128:
                previous_key = sha256(previous_browser_token.encode()).digest()
                self._pending.pop(previous_key, None)
            if len(self._pending) >= self._capacity:
                raise LoginCapacityError("Pending login capacity reached")
            self._pending[key] = PendingLogin(
                state=state,
                nonce=nonce,
                code_verifier=code_verifier,
                redirect_uri=redirect_uri,
                expires_at=now + FLOW_TTL_SECONDS,
            )

    def consume(self, browser_token: str | None, state: str | None) -> PendingLogin:
        if (
            not browser_token
            or not state
            or len(browser_token) > 128
            or len(state) > 128
        ):
            raise InvalidLoginFlow
        key = sha256(browser_token.encode()).digest()
        with self._lock:
            flow = self._pending.get(key)
            if flow is None:
                raise InvalidLoginFlow
            if flow.expires_at <= self._clock():
                del self._pending[key]
                raise InvalidLoginFlow
            if not compare_digest(flow.state.encode(), state.encode()):
                raise InvalidLoginFlow
            return self._pending.pop(key)
