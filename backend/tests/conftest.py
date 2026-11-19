"""Keep existing tests database-free unless the developer explicitly opts in."""

import httpx
import pytest


@pytest.fixture(autouse=True)
def no_live_provider_http(monkeypatch: pytest.MonkeyPatch) -> None:
    """All provider HTTP must use an explicit fake; PostgreSQL is unaffected."""

    def deny(*args: object, **kwargs: object) -> None:
        raise AssertionError("Live HTTP is forbidden in automated tests")

    async def deny_async(*args: object, **kwargs: object) -> None:
        raise AssertionError("Live HTTP is forbidden in automated tests")

    monkeypatch.setattr(httpx.HTTPTransport, "handle_request", deny)
    monkeypatch.setattr(httpx.AsyncHTTPTransport, "handle_async_request", deny_async)


def pytest_addoption(parser: pytest.Parser) -> None:
    parser.addoption(
        "--run-db-tests",
        action="store_true",
        default=False,
        help="Run PostgreSQL tests using a separate TEST_DATABASE_ADMIN_URL.",
    )


def pytest_collection_modifyitems(
    config: pytest.Config, items: list[pytest.Item]
) -> None:
    if config.getoption("--run-db-tests"):
        return
    skip = pytest.mark.skip(reason="Use --run-db-tests with TEST_DATABASE_ADMIN_URL")
    for item in items:
        if "database" in item.keywords:
            item.add_marker(skip)
