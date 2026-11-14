"""Response contract for the liveness endpoint."""

from typing import Literal

from pydantic import BaseModel


class HealthResponse(BaseModel):
    """A successful application liveness response."""

    status: Literal["ok"]
