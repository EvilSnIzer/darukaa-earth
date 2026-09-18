"""Observation model - a dated measurement record for a site.

One row per (site, date) holding every metric for that date. Wide-but-shallow rows
keep time-series queries to a single indexed range scan instead of an EAV join.
"""

from __future__ import annotations

import enum
import uuid
from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Date, Enum, Float, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, uuid_pk

if TYPE_CHECKING:
    from app.models.site import Site


class DataSource(enum.StrEnum):
    """Provenance matters for MRV: satellite, field survey, or modelled estimate."""

    satellite = "satellite"
    field_survey = "field_survey"
    modelled = "modelled"


class Observation(Base, TimestampMixin):
    __tablename__ = "observations"
    __table_args__ = (UniqueConstraint("site_id", "measured_on", name="uq_observation_site_date"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    measured_on: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    # Carbon
    carbon_sequestered_tco2e: Mapped[float | None] = mapped_column(Float, nullable=True)
    biomass_tonnes: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Vegetation health / cover
    ndvi: Mapped[float | None] = mapped_column(Float, nullable=True)
    canopy_cover_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    tree_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Biodiversity
    biodiversity_index: Mapped[float | None] = mapped_column(Float, nullable=True)
    species_observed: Mapped[int | None] = mapped_column(Integer, nullable=True)

    data_source: Mapped[DataSource] = mapped_column(
        Enum(DataSource, name="data_source", native_enum=True),
        default=DataSource.satellite,
        nullable=False,
    )
    notes: Mapped[str | None] = mapped_column(nullable=True)

    site_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("sites.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    site: Mapped[Site] = relationship(back_populates="observations")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Observation site={self.site_id} on={self.measured_on}>"
