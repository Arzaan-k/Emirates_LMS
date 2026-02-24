"""
Access Control Endpoints
Granular user data access management - allows admins to control which users can see which data
"""

import logging
from typing import Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, Form, Body
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.core.dependencies import get_current_user, require_admin, require_privilege
from app.services.access_control_service import AccessControlService
from app.models.access_control import GRANT_TYPES

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/access-control", tags=["Access Control"])


# ==========================================
# ORGANIZATION HIERARCHY
# ==========================================

@router.get("/hierarchy")
async def get_organization_hierarchy(db: Session = Depends(get_db)):
    """
    Get the organization hierarchy tree.
    Returns states, regions, cities, stores in both tree and flat format.
    """
    service = AccessControlService(db)
    return service.get_hierarchy_tree()


@router.get("/hierarchy/{type}")
async def get_hierarchy_by_type(
    type: str,
    db: Session = Depends(get_db)
):
    """
    Get hierarchy nodes of a specific type.

    Args:
        type: One of 'state', 'region', 'city', 'store'
    """
    valid_types = ['state', 'region', 'city', 'store']
    if type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid type. Must be one of: {valid_types}")

    service = AccessControlService(db)
    return {"items": service.get_hierarchy_by_type(type)}


@router.post("/hierarchy/sync")
async def sync_hierarchy(
    db: Session = Depends(get_db),
    current_user: Dict = Depends(require_admin)
):
    """
    Sync organization hierarchy from existing user data.
    Extracts unique States, Regions, Cities, and Stores from all users.
    Admin only.
    """
    service = AccessControlService(db)
    result = service.sync_hierarchy_from_users()
    logger.info(f"Hierarchy sync completed: {result}")
    return {"status": "success", **result}


# ==========================================
# ACCESS GRANTS
# ==========================================

@router.get("/grants")
async def list_all_grants(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: Dict = Depends(require_admin)
):
    """
    List all access grants with pagination.
    Admin only.
    """
    service = AccessControlService(db)
    grants = service.get_all_grants(skip, limit)
    return {"grants": grants, "count": len(grants)}


@router.get("/grants/summary")
async def get_grants_summary(
    db: Session = Depends(get_db),
    current_user: Dict = Depends(require_admin)
):
    """
    Get summary of grants grouped by user.
    Returns list of users with their grant counts and types.
    Admin only.
    """
    service = AccessControlService(db)
    summary = service.get_grants_summary()
    return {"summary": summary}


@router.get("/grants/user/{user_email}")
async def get_user_grants(
    user_email: str,
    db: Session = Depends(get_db),
    current_user: Dict = Depends(require_admin)
):
    """
    Get all grants for a specific user.
    Admin only.
    """
    service = AccessControlService(db)
    grants = service.get_grants_for_user(user_email)
    return {"grants": grants, "email": user_email, "count": len(grants)}


@router.post("/grants")
async def create_grant(
    grantee_email: str = Form(...),
    grant_type: str = Form(...),
    target_value: str = Form(...),
    auto_cascade: bool = Form(True),
    notes: str = Form(None),
    db: Session = Depends(get_db),
    current_user: Dict = Depends(require_admin)
):
    """
    Create a new access grant.

    Args:
        grantee_email: Email of the user being granted access
        grant_type: Type of grant - 'user', 'store', 'city', 'region', 'state', 'department', 'designation', 'role'
        target_value: The value to grant access to (e.g., store name, city name, user email)
        auto_cascade: If True, geographic grants cascade to child entities
        notes: Optional notes about the grant

    Auto-cascade behavior:
    - State grant -> automatically creates grants for all regions, cities, stores within that state
    - Region grant -> automatically creates grants for all cities, stores within that region
    - City grant -> automatically creates grants for all stores within that city
    """
    if grant_type not in GRANT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid grant_type. Must be one of: {GRANT_TYPES}"
        )

    service = AccessControlService(db)
    result = service.create_grant(
        grantee_email=grantee_email,
        grant_type=grant_type,
        target_value=target_value,
        granted_by=current_user.get('email', 'admin'),
        auto_cascade=auto_cascade,
        notes=notes
    )

    if result.get('status') == 'error':
        raise HTTPException(status_code=400, detail=result.get('message'))

    logger.info(f"Grant created: {grantee_email} -> {grant_type}:{target_value} by {current_user.get('email')}")
    return result


@router.post("/grants/bulk")
async def create_bulk_grants(
    data: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    current_user: Dict = Depends(require_admin)
):
    """
    Create multiple grants at once.

    Request body format:
    {
        "grantee_email": "user@example.com",
        "grants": [
            {"type": "store", "values": ["Store A", "Store B"]},
            {"type": "city", "values": ["Mumbai", "Delhi"]},
            {"type": "user", "values": ["other@example.com"]}
        ],
        "auto_cascade": true
    }
    """
    grantee = data.get('grantee_email')
    grants = data.get('grants', [])
    auto_cascade = data.get('auto_cascade', True)

    if not grantee:
        raise HTTPException(status_code=400, detail="grantee_email is required")

    if not grants:
        raise HTTPException(status_code=400, detail="grants list is required")

    # Validate grant types
    for grant_group in grants:
        grant_type = grant_group.get('type')
        if grant_type not in GRANT_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid grant type '{grant_type}'. Must be one of: {GRANT_TYPES}"
            )

    service = AccessControlService(db)
    result = service.create_bulk_grants(
        grantee_email=grantee,
        grants=grants,
        granted_by=current_user.get('email', 'admin'),
        auto_cascade=auto_cascade
    )

    logger.info(f"Bulk grants created for {grantee}: {result.get('total_created')} grants")
    return result


@router.delete("/grants/{grant_id}")
async def revoke_grant(
    grant_id: int,
    db: Session = Depends(get_db),
    current_user: Dict = Depends(require_admin)
):
    """
    Revoke an access grant.
    Also revokes any cascaded grants that were created from this grant.
    """
    service = AccessControlService(db)
    result = service.revoke_grant(grant_id)

    if result.get('status') == 'not_found':
        raise HTTPException(status_code=404, detail="Grant not found")

    logger.info(f"Grant {grant_id} revoked by {current_user.get('email')}")
    return result


# ==========================================
# ACCESSIBLE USERS
# ==========================================

@router.get("/accessible-users/{viewer_email}")
async def get_accessible_users(
    viewer_email: str,
    db: Session = Depends(get_db),
    current_user: Dict = Depends(require_admin)
):
    """
    Get list of users that a viewer can access based on their grants.
    Admin only - used for previewing what a user will see.
    """
    service = AccessControlService(db)
    users = service.get_accessible_users(viewer_email)
    return {
        "viewer_email": viewer_email,
        "accessible_count": len(users),
        "users": [u.to_dict() for u in users]
    }


@router.get("/my-accessible-users")
async def get_my_accessible_users(
    db: Session = Depends(get_db),
    current_user: Dict = Depends(get_current_user)
):
    """
    Get list of users that the current user can access.
    Used by the frontend to filter data displayed to the user.
    """
    service = AccessControlService(db)
    users = service.get_accessible_users(current_user.get('email'))
    return {
        "accessible_count": len(users),
        "users": [u.to_dict() for u in users]
    }


@router.get("/check-access/{target_email}")
async def check_access_to_user(
    target_email: str,
    db: Session = Depends(get_db),
    current_user: Dict = Depends(get_current_user)
):
    """
    Check if the current user has access to view a specific target user's data.
    """
    service = AccessControlService(db)
    has_access = service.check_access(current_user.get('email'), target_email)
    return {"has_access": has_access, "target_email": target_email}


# ==========================================
# FILTER OPTIONS
# ==========================================

@router.get("/filter-options")
async def get_filter_options(db: Session = Depends(get_db)):
    """
    Get all available filter options for creating grants.
    Returns distinct values for stores, cities, regions, states, departments, designations, roles.
    Also returns list of users for individual user grants.
    """
    service = AccessControlService(db)
    return service.get_filter_options()


# ==========================================
# USER ACCESS MANAGEMENT (Combined View)
# ==========================================

@router.get("/user-access/{user_email}")
async def get_user_access_details(
    user_email: str,
    db: Session = Depends(get_db),
    current_user: Dict = Depends(require_admin)
):
    """
    Get comprehensive access details for a user.
    Includes their grants, accessible users count, and grant type breakdown.
    """
    service = AccessControlService(db)

    grants = service.get_grants_for_user(user_email)
    accessible_users = service.get_accessible_users(user_email)

    # Group grants by type
    grants_by_type = {}
    for grant in grants:
        grant_type = grant.get('grant_type')
        if grant_type not in grants_by_type:
            grants_by_type[grant_type] = []
        grants_by_type[grant_type].append(grant)

    # Count primary vs cascaded
    primary_count = sum(1 for g in grants if not g.get('is_cascaded'))
    cascaded_count = sum(1 for g in grants if g.get('is_cascaded'))

    return {
        "user_email": user_email,
        "grants": grants,
        "grants_by_type": grants_by_type,
        "total_grants": len(grants),
        "primary_grants": primary_count,
        "cascaded_grants": cascaded_count,
        "accessible_users_count": len(accessible_users),
    }


@router.delete("/user-access/{user_email}/all")
async def revoke_all_user_grants(
    user_email: str,
    db: Session = Depends(get_db),
    current_user: Dict = Depends(require_admin)
):
    """
    Revoke all access grants for a user.
    Admin only.
    """
    from app.repositories.access_control_repository import UserAccessGrantRepository

    grant_repo = UserAccessGrantRepository(db)
    revoked_count = grant_repo.delete_all_grants_for_user(user_email)

    logger.info(f"All grants ({revoked_count}) revoked for {user_email} by {current_user.get('email')}")
    return {
        "status": "success",
        "user_email": user_email,
        "revoked_count": revoked_count
    }
