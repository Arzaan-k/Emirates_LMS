"""
Access Control Repository
Data access layer for organization hierarchy and user access grants
"""

from typing import Any, Dict, List, Optional, Set
from datetime import datetime
from sqlalchemy import func, or_, and_, distinct
from sqlalchemy.orm import Session

from app.repositories.base import BaseRepository
from app.models.access_control import OrganizationHierarchy, UserAccessGrant, GEOGRAPHIC_HIERARCHY
from app.models.user import User


class OrganizationHierarchyRepository(BaseRepository[OrganizationHierarchy]):
    """Repository for OrganizationHierarchy operations."""

    def __init__(self, db: Session):
        super().__init__(db, OrganizationHierarchy)

    def get_by_type(self, type: str) -> List[OrganizationHierarchy]:
        """Get all hierarchy nodes of a specific type."""
        return self.db.query(OrganizationHierarchy).filter(
            OrganizationHierarchy.type == type,
            OrganizationHierarchy.is_active == True
        ).order_by(OrganizationHierarchy.name).all()

    def get_by_name_and_type(self, name: str, type: str) -> Optional[OrganizationHierarchy]:
        """Get a hierarchy node by name and type."""
        return self.db.query(OrganizationHierarchy).filter(
            OrganizationHierarchy.name == name,
            OrganizationHierarchy.type == type,
            OrganizationHierarchy.is_active == True
        ).first()

    def get_children(self, parent_id: str) -> List[OrganizationHierarchy]:
        """Get direct children of a hierarchy node."""
        return self.db.query(OrganizationHierarchy).filter(
            OrganizationHierarchy.parent_id == parent_id,
            OrganizationHierarchy.is_active == True
        ).order_by(OrganizationHierarchy.name).all()

    def get_all_descendants(self, parent_id: str) -> List[OrganizationHierarchy]:
        """Get all descendants (children, grandchildren, etc.) of a node using path."""
        parent = self.get_by_id(parent_id)
        if not parent:
            return []

        path_prefix = f"{parent.path}/" if parent.path else f"{parent.name}/"
        return self.db.query(OrganizationHierarchy).filter(
            OrganizationHierarchy.path.like(f"{path_prefix}%"),
            OrganizationHierarchy.is_active == True
        ).all()

    def get_hierarchy_tree(self) -> Dict[str, Any]:
        """Get full hierarchy as a tree structure."""
        all_nodes = self.db.query(OrganizationHierarchy).filter(
            OrganizationHierarchy.is_active == True
        ).order_by(OrganizationHierarchy.name).all()

        # Build tree structure
        nodes_by_id = {node.id: {**node.to_dict(), 'children': []} for node in all_nodes}
        roots = []

        for node in all_nodes:
            if node.parent_id and node.parent_id in nodes_by_id:
                nodes_by_id[node.parent_id]['children'].append(nodes_by_id[node.id])
            elif not node.parent_id:
                roots.append(nodes_by_id[node.id])

        # Also group by type for flat access
        by_type = {t: [] for t in GEOGRAPHIC_HIERARCHY}
        for node in all_nodes:
            if node.type in by_type:
                by_type[node.type].append(node.to_dict())

        return {
            "tree": roots,
            **by_type,
        }

    def get_all_active(self) -> List[OrganizationHierarchy]:
        """Get all active hierarchy nodes."""
        return self.db.query(OrganizationHierarchy).filter(
            OrganizationHierarchy.is_active == True
        ).order_by(OrganizationHierarchy.type, OrganizationHierarchy.name).all()

    def upsert(self, data: Dict[str, Any]) -> OrganizationHierarchy:
        """Create or update a hierarchy node."""
        existing = self.get_by_id(data.get('id'))
        if existing:
            for key, value in data.items():
                if hasattr(existing, key) and value is not None:
                    setattr(existing, key, value)
            self.db.commit()
            self.db.refresh(existing)
            return existing
        return self.create(data)


class UserAccessGrantRepository(BaseRepository[UserAccessGrant]):
    """Repository for UserAccessGrant operations."""

    def __init__(self, db: Session):
        super().__init__(db, UserAccessGrant)

    def get_grants_for_user(self, grantee_email: str) -> List[UserAccessGrant]:
        """Get all active, non-expired grants for a user."""
        now = datetime.utcnow()
        return self.db.query(UserAccessGrant).filter(
            UserAccessGrant.grantee_email == grantee_email,
            UserAccessGrant.is_active == True,
            or_(
                UserAccessGrant.expires_at == None,
                UserAccessGrant.expires_at > now
            )
        ).order_by(UserAccessGrant.grant_type, UserAccessGrant.target_value).all()

    def get_grants_by_type(self, grantee_email: str, grant_type: str) -> List[UserAccessGrant]:
        """Get grants of a specific type for a user."""
        return self.db.query(UserAccessGrant).filter(
            UserAccessGrant.grantee_email == grantee_email,
            UserAccessGrant.grant_type == grant_type,
            UserAccessGrant.is_active == True
        ).order_by(UserAccessGrant.target_value).all()

    def grant_exists(self, grantee_email: str, grant_type: str, target_value: str) -> bool:
        """Check if a grant already exists."""
        return self.db.query(UserAccessGrant).filter(
            UserAccessGrant.grantee_email == grantee_email,
            UserAccessGrant.grant_type == grant_type,
            UserAccessGrant.target_value == target_value,
            UserAccessGrant.is_active == True
        ).first() is not None

    def get_grant(self, grantee_email: str, grant_type: str, target_value: str) -> Optional[UserAccessGrant]:
        """Get a specific grant."""
        return self.db.query(UserAccessGrant).filter(
            UserAccessGrant.grantee_email == grantee_email,
            UserAccessGrant.grant_type == grant_type,
            UserAccessGrant.target_value == target_value,
            UserAccessGrant.is_active == True
        ).first()

    def revoke_grant(self, grant_id: int) -> bool:
        """Soft-revoke a grant by setting is_active to False. Also revokes cascaded children."""
        grant = self.get_by_id(grant_id)
        if grant:
            grant.is_active = False
            # Also revoke cascaded grants
            cascaded = self.db.query(UserAccessGrant).filter(
                UserAccessGrant.cascaded_from_id == grant_id,
                UserAccessGrant.is_active == True
            ).all()
            for c in cascaded:
                c.is_active = False
            self.db.commit()
            return True
        return False

    def get_cascaded_grants(self, parent_grant_id: int) -> List[UserAccessGrant]:
        """Get all grants cascaded from a parent grant."""
        return self.db.query(UserAccessGrant).filter(
            UserAccessGrant.cascaded_from_id == parent_grant_id,
            UserAccessGrant.is_active == True
        ).all()

    def get_all_grants(self, skip: int = 0, limit: int = 100) -> List[UserAccessGrant]:
        """Get all active grants with pagination."""
        return self.db.query(UserAccessGrant).filter(
            UserAccessGrant.is_active == True
        ).order_by(
            UserAccessGrant.grantee_email,
            UserAccessGrant.grant_type
        ).offset(skip).limit(limit).all()

    def get_grants_summary_by_user(self) -> List[Dict[str, Any]]:
        """Get summary of grants grouped by user."""
        results = self.db.query(
            UserAccessGrant.grantee_email,
            func.count(UserAccessGrant.id).label('grant_count'),
        ).filter(
            UserAccessGrant.is_active == True
        ).group_by(
            UserAccessGrant.grantee_email
        ).order_by(
            UserAccessGrant.grantee_email
        ).all()

        summaries = []
        for r in results:
            # Get grant types for this user
            grant_types = self.db.query(distinct(UserAccessGrant.grant_type)).filter(
                UserAccessGrant.grantee_email == r.grantee_email,
                UserAccessGrant.is_active == True
            ).all()

            summaries.append({
                'email': r.grantee_email,
                'grant_count': r.grant_count,
                'grant_types': [gt[0] for gt in grant_types]
            })

        return summaries

    def get_users_with_grants(self) -> List[str]:
        """Get list of all user emails that have any grants."""
        results = self.db.query(distinct(UserAccessGrant.grantee_email)).filter(
            UserAccessGrant.is_active == True
        ).all()
        return [r[0] for r in results]

    def delete_all_grants_for_user(self, grantee_email: str) -> int:
        """Soft-delete all grants for a user. Returns count of deleted grants."""
        grants = self.db.query(UserAccessGrant).filter(
            UserAccessGrant.grantee_email == grantee_email,
            UserAccessGrant.is_active == True
        ).all()

        count = 0
        for grant in grants:
            grant.is_active = False
            count += 1

        self.db.commit()
        return count

    def get_target_values_by_type(self, grant_type: str) -> Set[str]:
        """Get all unique target values for a grant type."""
        results = self.db.query(distinct(UserAccessGrant.target_value)).filter(
            UserAccessGrant.grant_type == grant_type,
            UserAccessGrant.is_active == True
        ).all()
        return {r[0] for r in results}
