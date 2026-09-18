"""Project model - a carbon or biodiversity initiative containing many sites."""

from __future__ import annotations

import enum
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, uuid_pk

if TYPE_CHECKING:
    from app.models.site import Site
    from app.models.user import User


class ProjectType(enum.StrEnum):
    """Nature-based solution categories relevant to carbon & biodiversity MRV."""

    reforestation = "reforestation"
    afforestation = "afforestation"
    mangrove_restoration = "mangrove_restoration"
    agroforestry = "agroforestry"
    avoided_deforestation = "avoided_deforestation"
    biodiversity_conservation = "biodiversity_conservation"
    wetland_restoration = "wetland_restoration"


class ProjectStatus(enum.StrEnum):
    planning = "planning"
    active = "active"
    paused = "paused"
    completed = "completed"


class Project(Base, TimestampMixin):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    project_type: Mapped[ProjectType] = mapped_column(
        Enum(ProjectType, name="project_type", native_enum=True),
        nullable=False,
        default=ProjectType.reforestation,
    )
    status: Mapped[ProjectStatus] = mapped_column(
        Enum(ProjectStatus, name="project_status", native_enum=True),
        nullable=False,
        default=ProjectStatus.planning,
    )
    country: Mapped[str] = mapped_column(String(120), nullable=False, default="India")
    methodology: Mapped[str | None] = mapped_column(String(120), nullable=True)
    baseline_year: Mapped[int | None] = mapped_column(nullable=True)

    owner_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    owner: Mapped[User] = relationship(back_populates="projects")
    sites: Mapped[list[Site]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Project {self.name}>"
