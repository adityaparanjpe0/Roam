"""Provider compression must decode once, preserving decoded-body limits."""

import gzip
import zlib

import httpx
import pytest

from app.providers.google_oidc import GoogleDiscoveryError, _bounded_response
from tests.test_oauth_login import mock_discovery


def compressed_response(
    body: bytes, encoding: str, chunked: bool = False
) -> httpx.Response:
    encoded = gzip.compress(body) if encoding == "gzip" else zlib.compress(body)
    headers = {"Content-Type": "application/json", "Content-Encoding": encoding}
    if chunked:
        headers["Transfer-Encoding"] = "chunked"
    else:
        headers["Content-Length"] = str(len(encoded))
    # stream= models wire bytes without eager decoding in Response.__init__.
    return httpx.Response(200, headers=headers, stream=httpx.ByteStream(encoded))


@pytest.mark.parametrize("encoding", ["gzip", "deflate"])
@pytest.mark.parametrize("chunked", [False, True])
def test_compressed_json_is_decoded_once_and_headers_match_body(
    monkeypatch: pytest.MonkeyPatch, encoding: str, chunked: bool
) -> None:
    body = b'{"message":"synthetic metadata"}'
    mock_discovery(monkeypatch, lambda _: compressed_response(body, encoding, chunked))
    response = _bounded_response("GET", "https://accounts.google.com/synthetic")
    assert response.json() == {"message": "synthetic metadata"}
    assert response.content == body
    assert response.headers["content-length"] == str(len(body))
    assert "content-encoding" not in response.headers
    assert "transfer-encoding" not in response.headers


@pytest.mark.parametrize("encoding", ["gzip", "deflate"])
@pytest.mark.parametrize("size", [65536, 65537])
def test_size_limit_counts_decoded_bytes(
    monkeypatch: pytest.MonkeyPatch, encoding: str, size: int
) -> None:
    body = b" " * size
    mock_discovery(monkeypatch, lambda _: compressed_response(body, encoding))
    if size > 65536:
        with pytest.raises(GoogleDiscoveryError):
            _bounded_response("GET", "https://accounts.google.com/synthetic")
    else:
        assert (
            _bounded_response("GET", "https://accounts.google.com/synthetic").content
            == body
        )
