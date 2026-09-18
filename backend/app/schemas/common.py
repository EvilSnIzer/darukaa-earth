"""Reusable response envelopes."""

from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class Message(BaseModel):
    detail: str


class Paginated(BaseModel, Generic[T]):
    items: list[T]
    total: int
