"""Site model - a mapped parcel of land, stored as a PostGIS geometry."""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from geoalchemy2 import Geometry
from sqlalchemy import Float, ForeignKey, Index, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, uuid_pk

if TYPE_CHECKING:
    from app.models.observation import Observation
    from app.models.project import Project

# MultiPolygon keeps drawing behaviour predictable: a drawn Polygon is promoted to a
# MultiPolygon so a site may later hold disjoint parcels without a schema change.
SITE_SRID = 4326
SITE_GEOMETRY_TYPE = "MULTIPOLYGON"


class Site(Base, TimestampMixin):
    __tablename__ = "sites"
    __table_args__ = (
        Index(
            "ix_sites_project_id_name",
            "project_id",
            "name",
            unique=True,
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Spatial data: WGS84 lon/lat, validated by PostGIS on write.
    geometry = mapped_column(
        Geometry(
            geometry_type=SITE_GEOMETRY_TYPE,
            srid=SITE_SRID,
            spatial_index=True,
        ),
        nullable=False,
    )

    # Denormalised metrics computed server-side from the geometry so the map and
    # list views never have to ship WKB to the browser.
    area_hectares: Mapped[float] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    centroid_lat: Mapped[float] = mapped_column(Float, nullable=True)
    centroid_lng: Mapped[float] = mapped_column(Float, nullable=True)

    land_cover: Mapped[str | None] = mapped_column(String(120), nullable=True)
    planting_year: Mapped[int | None] = mapped_column(nullable=True)

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    project: Mapped[Project] = relationship(back_populates="sites")
    observations: Mapped[list[Observation]] = relationship(
        back_populates="site",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="Observation.measured_on",
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Site {self.name} ({self.area_hectares} ha)>"
