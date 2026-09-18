"""Initial schema: users, projects, PostGIS sites, observations.

Revision ID: 0001
Revises:
Create Date: 2026-09-18
"""

from __future__ import annotations

from collections.abc import Sequence

import geoalchemy2
import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # PostGIS must be present before any geometry column is created.
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column(
            "role",
            sa.Enum("admin", "viewer", name="user_role"),
            nullable=False,
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)

    op.create_table(
        "projects",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "project_type",
            sa.Enum(
                "reforestation",
                "afforestation",
                "mangrove_restoration",
                "agroforestry",
                "avoided_deforestation",
                "biodiversity_conservation",
                "wetland_restoration",
                name="project_type",
            ),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum("planning", "active", "paused", "completed", name="project_status"),
            nullable=False,
        ),
        sa.Column("country", sa.String(length=120), nullable=False),
        sa.Column("methodology", sa.String(length=120), nullable=True),
        sa.Column("baseline_year", sa.Integer(), nullable=True),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_projects_name"), "projects", ["name"], unique=True)
    op.create_index(op.f("ix_projects_owner_id"), "projects", ["owner_id"], unique=False)

    op.create_table(
        "sites",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "geometry",
            geoalchemy2.types.Geometry(
                geometry_type="MULTIPOLYGON",
                srid=4326,
                dimension=2,
                from_text="ST_GeomFromEWKT",
                name="geometry",
            ),
            nullable=False,
        ),
        sa.Column("area_hectares", sa.Numeric(precision=14, scale=4), nullable=False),
        sa.Column("centroid_lat", sa.Float(), nullable=True),
        sa.Column("centroid_lng", sa.Float(), nullable=True),
        sa.Column("land_cover", sa.String(length=120), nullable=True),
        sa.Column("planting_year", sa.Integer(), nullable=True),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    # NB: the GiST index `idx_sites_geometry` is created by GeoAlchemy2 itself,
    # because the column is declared with spatial_index=True. Creating it here too
    # raises DuplicateTable, so it is intentionally not repeated.
    op.create_index(op.f("ix_sites_project_id"), "sites", ["project_id"], unique=False)
    op.create_index("ix_sites_project_id_name", "sites", ["project_id", "name"], unique=True)

    op.create_table(
        "observations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("measured_on", sa.Date(), nullable=False),
        sa.Column("carbon_sequestered_tco2e", sa.Float(), nullable=True),
        sa.Column("biomass_tonnes", sa.Float(), nullable=True),
        sa.Column("ndvi", sa.Float(), nullable=True),
        sa.Column("canopy_cover_pct", sa.Float(), nullable=True),
        sa.Column("tree_count", sa.Integer(), nullable=True),
        sa.Column("biodiversity_index", sa.Float(), nullable=True),
        sa.Column("species_observed", sa.Integer(), nullable=True),
        sa.Column(
            "data_source",
            sa.Enum("satellite", "field_survey", "modelled", name="data_source"),
            nullable=False,
        ),
        sa.Column("notes", sa.String(), nullable=True),
        sa.Column("site_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["site_id"], ["sites.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("site_id", "measured_on", name="uq_observation_site_date"),
    )
    op.create_index(
        op.f("ix_observations_measured_on"), "observations", ["measured_on"], unique=False
    )
    op.create_index(op.f("ix_observations_site_id"), "observations", ["site_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_observations_site_id"), table_name="observations")
    op.drop_index(op.f("ix_observations_measured_on"), table_name="observations")
    op.drop_table("observations")
    op.drop_index("ix_sites_project_id_name", table_name="sites")
    op.drop_index(op.f("ix_sites_project_id"), table_name="sites")
    # idx_sites_geometry is dropped together with the table by GeoAlchemy2's
    # spatial_index handling.
    op.drop_table("sites")
    op.drop_index(op.f("ix_projects_owner_id"), table_name="projects")
    op.drop_index(op.f("ix_projects_name"), table_name="projects")
    op.drop_table("projects")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
    # Enum types are dropped explicitly: PostgreSQL keeps them after their tables go.
    sa.Enum(name="data_source").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="project_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="project_type").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="user_role").drop(op.get_bind(), checkfirst=True)
