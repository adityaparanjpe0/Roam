"""The default HTTPX transports fail before any socket/provider request."""

import asyncio

import httpx
import pytest


def test_default_sync_http_cannot_reach_google() -> None:
    with pytest.raises(AssertionError, match="Live HTTP is forbidden"):
        with httpx.Client(trust_env=False) as client:
            client.get("https://accounts.google.com/.well-known/openid-configuration")


def test_default_async_http_cannot_reach_google() -> None:
    async def attempt() -> None:
        async with httpx.AsyncClient(trust_env=False) as client:
            await client.get(
                "https://accounts.google.com/.well-known/openid-configuration"
            )

    with pytest.raises(AssertionError, match="Live HTTP is forbidden"):
        asyncio.run(attempt())
