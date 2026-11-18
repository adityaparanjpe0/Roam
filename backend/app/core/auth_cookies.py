"""Reject ambiguous authentication cookies before choosing any credential."""

from starlette.requests import Request, cookie_parser


class AmbiguousAuthCookies(ValueError):
    """Multiple values cannot safely identify a flow or application session."""


def auth_cookies(request: Request, names: tuple[str, ...]) -> dict[str, str]:
    headers = request.headers.getlist("cookie")
    if len(headers) > 1:
        raise AmbiguousAuthCookies
    selected: dict[str, str] = {}
    # Use the framework's parsing/whitespace rules, not raw startswith checks.
    # Parse each segment separately so the dictionary cannot hide duplicates.
    for part in (headers[0] if headers else "").split(";"):
        for name, value in cookie_parser(part).items():
            if name in names:
                if name in selected:
                    raise AmbiguousAuthCookies
                selected[name] = value
    return selected
