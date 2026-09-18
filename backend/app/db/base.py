"""Declarative base + metadata imports.

Every model module must be imported here so that `Base.metadata` is complete for
Alembic autogenerate and for `create_all` in tests.
"""

from app.db.base_class import Base
from app.models.observation import Observation
from app.models.project import Project
from app.models.site import Site
from app.models.user import User

__all__ = ["Base", "Observation", "Project", "Site", "User"]
