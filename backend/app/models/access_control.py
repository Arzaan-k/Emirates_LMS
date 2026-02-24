"""
Access Control Domain Models
Organization hierarchy and user access grants for granular data access management
"""

from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime,
    Text, JSON, Index, ForeignKey
)
from sqlalchemy.orm import relationship, backref

from app.models.base import Base


class OrganizationHierarchy(Base):
    """
    Organization structure: States -> Regions -> Cities -> Stores
    Tree structure for geographic hierarchy with denormalized path for efficient querying.
    """
    __tablename__ = "organization_hierarchy"

    id = Column(String(100), primary_key=True)
    name = Column(String(255), nullable=False)
    type = Column(String(50), nullable=False)  # 'state', 'region', 'city', 'store'
    parent_id = Column(String(100), ForeignKey('organization_hierarchy.id'), nullable=True)

    # Denormalized path for efficient descendant queries
    # e.g., "Maharashtra/West/Mumbai/Mumbai Central"
    path = Column(String(1000), nullable=True)

    # Optional metadata
    code = Column(String(50), nullable=True)  # Store code, region code, etc.
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    extra_data = Column(JSON, default={})

    # Self-referential relationship for parent-child hierarchy
    # foreign_keys specifies which column points to the parent
    # remote_side specifies the "one" side of the many-to-one
    children = relationship(
        "OrganizationHierarchy",
        backref=backref("parent", remote_side="OrganizationHierarchy.id"),
        foreign_keys=[parent_id],
        lazy="select"
    )

    __table_args__ = (
        Index('idx_org_type', 'type'),
        Index('idx_org_parent', 'parent_id'),
        Index('idx_org_path', 'path'),
        Index('idx_org_active', 'is_active'),
        Index('idx_org_name', 'name'),
    )

    def __repr__(self):
        return f"<OrganizationHierarchy {self.type}: {self.name}>"

    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": self.id,
            "name": self.name,
            "type": self.type,
            "parent_id": self.parent_id,
            "path": self.path,
            "code": self.code,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "extra_data": self.extra_data or {},
        }


class UserAccessGrant(Base):
    """
    Access grants that define which users/data a viewer can see.
    Supports multiple grant types: individual users, stores, cities, regions, states,
    departments, designations, and roles.

    Auto-cascading: Geographic grants (state, region, city) automatically cascade
    to child entities when created.
    """
    __tablename__ = "user_access_grants"

    id = Column(Integer, primary_key=True, index=True)

    # The user who is being granted access (the viewer)
    grantee_email = Column(String(255), ForeignKey('users.email'), nullable=False, index=True)

    # Grant type and target
    # Types: 'user', 'store', 'city', 'region', 'state', 'department', 'designation', 'role'
    grant_type = Column(String(50), nullable=False)
    target_value = Column(String(255), nullable=False)  # The actual value (email, store name, city name, etc.)

    # Optional: Reference to OrganizationHierarchy for geographic grants
    org_hierarchy_id = Column(String(100), ForeignKey('organization_hierarchy.id'), nullable=True)

    # Auto-cascaded from parent grant (for display purposes)
    is_cascaded = Column(Boolean, default=False)
    cascaded_from_id = Column(Integer, ForeignKey('user_access_grants.id'), nullable=True)

    # Metadata
    granted_by = Column(String(255), nullable=True)  # Admin who created this grant
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)  # Optional expiration
    is_active = Column(Boolean, default=True)  # Soft delete
    notes = Column(Text, nullable=True)

    # Self-referential relationship for cascaded grants
    # parent_grant points to the grant this was cascaded from
    # cascaded_children are all grants created from this one
    cascaded_children = relationship(
        "UserAccessGrant",
        backref=backref("parent_grant", remote_side="UserAccessGrant.id"),
        foreign_keys=[cascaded_from_id],
        lazy="select"
    )

    __table_args__ = (
        Index('idx_grant_grantee', 'grantee_email'),
        Index('idx_grant_type', 'grant_type'),
        Index('idx_grant_target', 'target_value'),
        Index('idx_grant_active', 'is_active'),
        Index('idx_grant_combo', 'grantee_email', 'grant_type', 'target_value'),
        Index('idx_grant_cascaded', 'cascaded_from_id'),
    )

    def __repr__(self):
        return f"<UserAccessGrant {self.grantee_email} -> {self.grant_type}:{self.target_value}>"

    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": self.id,
            "grantee_email": self.grantee_email,
            "grant_type": self.grant_type,
            "target_value": self.target_value,
            "org_hierarchy_id": self.org_hierarchy_id,
            "is_cascaded": self.is_cascaded,
            "cascaded_from_id": self.cascaded_from_id,
            "granted_by": self.granted_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "is_active": self.is_active,
            "notes": self.notes,
        }


# Grant type constants
GRANT_TYPES = [
    'user',        # Direct access to specific user
    'store',       # Access to all users in a store
    'city',        # Access to all users in a city (cascades to stores)
    'region',      # Access to all users in a region (cascades to cities, stores)
    'state',       # Access to all users in a state (cascades to regions, cities, stores)
    'department',  # Access to all users in a department
    'designation', # Access to all users with a designation
    'role',        # Access to all users with a role
]

# Geographic hierarchy order (for cascading)
GEOGRAPHIC_HIERARCHY = ['state', 'region', 'city', 'store']
