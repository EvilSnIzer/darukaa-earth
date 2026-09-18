"""JSON response class backed by orjson.

FastAPI deprecated its own `ORJSONResponse` in favour of built-in serialisation,
but the GeoJSON map endpoints still benefit from orjson's speed on large feature
collections, so we keep a thin, non-deprecated subclass of `Response`.
"""

from __future__ import annotations

from typing import Any

import orjson
from starlette.responses import Response


class ORJSONResponse(Response):
    media_type = "application/json"

    def render(self, content: Any) -> bytes:
        return orjson.dumps(
            content,
            option=orjson.OPT_NON_STR_KEYS | orjson.OPT_SERIALIZE_NUMPY,
        )
