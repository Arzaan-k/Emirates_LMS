"""
Access Control Service
Business logic for access grants, hierarchy management, and user filtering
"""

import logging
import time
from typing import Any, Dict, List, Optional, Set
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

from app.repositories.access_control_repository import (
    OrganizationHierarchyRepository,
    UserAccessGrantRepository
)
from app.repositories.user_repository import UserRepository
from app.models.access_control import OrganizationHierarchy, UserAccessGrant, GEOGRAPHIC_HIERARCHY, GRANT_TYPES
from app.models.user import User

logger = logging.getLogger(__name__)

from app.services._user_cache import user_cache as _user_cache


def invalidate_user_cache() -> None:
    """Call after any user create/update/delete to flush the cache."""
    _user_cache.invalidate()


class AccessControlService:
    """Service for access control operations."""

    def __init__(self, db: Session):
        self.db = db
        self.hierarchy_repo = OrganizationHierarchyRepository(db)
        self.grant_repo = UserAccessGrantRepository(db)
        self.user_repo = UserRepository(db)

    def _get_all_users(self) -> List[User]:
        """Return all users, served from a 90-second process-level cache."""
        cached = _user_cache.get()
        if cached is not None:
            return cached
        users = self.db.query(User).all()
        _user_cache.set(users)
        return users

    # ===========================================
    # ORGANIZATION HIERARCHY
    # ===========================================

    def get_hierarchy_tree(self) -> Dict[str, Any]:
        """Get the organization hierarchy as a tree."""
        return self.hierarchy_repo.get_hierarchy_tree()

    def get_hierarchy_by_type(self, type: str) -> List[Dict]:
        """Get all hierarchy nodes of a specific type."""
        nodes = self.hierarchy_repo.get_by_type(type)
        return [n.to_dict() for n in nodes]

    def sync_hierarchy_from_users(self) -> Dict[str, Any]:
        """
        Sync organization hierarchy from existing user data.
        Extracts unique States, Regions, Cities, and Stores from users.
        """
        all_users = self._get_all_users()

        states = set()
        regions = set()
        cities = set()
        stores = set()

        # Also track relationships for parent linking
        city_to_state = {}
        city_to_region = {}
        store_to_city = {}

        for user in all_users:
            pd = user.profile_data or {}

            state = pd.get('State')
            region = pd.get('Region')
            city = pd.get('City')
            store = user.store

            if state and str(state).strip() and str(state).lower() not in ['nan', 'none', 'n/a', '']:
                states.add(str(state).strip())

            if region and str(region).strip() and str(region).lower() not in ['nan', 'none', 'n/a', '']:
                regions.add(str(region).strip())

            if city and str(city).strip() and str(city).lower() not in ['nan', 'none', 'n/a', '']:
                city_clean = str(city).strip()
                cities.add(city_clean)
                if state:
                    city_to_state[city_clean] = str(state).strip()
                if region:
                    city_to_region[city_clean] = str(region).strip()

            if store and str(store).strip() and str(store).lower() not in ['nan', 'none', 'n/a', 'unassigned', '']:
                store_clean = str(store).strip()
                stores.add(store_clean)
                if city:
                    store_to_city[store_clean] = str(city).strip()

        created = 0

        # Create states
        for state in states:
            if not self._hierarchy_exists('state', state):
                self.hierarchy_repo.create({
                    'id': f"state_{self._slug(state)}",
                    'name': state,
                    'type': 'state',
                    'path': state,
                })
                created += 1
                logger.info(f"Created state hierarchy: {state}")

        # Create regions
        for region in regions:
            if not self._hierarchy_exists('region', region):
                self.hierarchy_repo.create({
                    'id': f"region_{self._slug(region)}",
                    'name': region,
                    'type': 'region',
                    'path': region,
                })
                created += 1
                logger.info(f"Created region hierarchy: {region}")

        # Create cities with parent linking
        for city in cities:
            if not self._hierarchy_exists('city', city):
                parent_id = None
                path = city

                # Try to link to region or state
                if city in city_to_region:
                    region_name = city_to_region[city]
                    region_node = self.hierarchy_repo.get_by_name_and_type(region_name, 'region')
                    if region_node:
                        parent_id = region_node.id
                        path = f"{region_node.path}/{city}"
                elif city in city_to_state:
                    state_name = city_to_state[city]
                    state_node = self.hierarchy_repo.get_by_name_and_type(state_name, 'state')
                    if state_node:
                        parent_id = state_node.id
                        path = f"{state_node.path}/{city}"

                self.hierarchy_repo.create({
                    'id': f"city_{self._slug(city)}",
                    'name': city,
                    'type': 'city',
                    'parent_id': parent_id,
                    'path': path,
                })
                created += 1
                logger.info(f"Created city hierarchy: {city}")

        # Create stores with parent linking
        for store in stores:
            if not self._hierarchy_exists('store', store):
                parent_id = None
                path = store

                # Try to link to city
                if store in store_to_city:
                    city_name = store_to_city[store]
                    city_node = self.hierarchy_repo.get_by_name_and_type(city_name, 'city')
                    if city_node:
                        parent_id = city_node.id
                        path = f"{city_node.path}/{store}"

                self.hierarchy_repo.create({
                    'id': f"store_{self._slug(store)}",
                    'name': store,
                    'type': 'store',
                    'parent_id': parent_id,
                    'path': path,
                })
                created += 1
                logger.info(f"Created store hierarchy: {store}")

        return {
            'created': created,
            'counts': {
                'states': len(states),
                'regions': len(regions),
                'cities': len(cities),
                'stores': len(stores),
            }
        }

    def _hierarchy_exists(self, type: str, name: str) -> bool:
        """Check if a hierarchy node exists."""
        return self.hierarchy_repo.get_by_name_and_type(name, type) is not None

    def _slug(self, name: str) -> str:
        """Convert name to slug for ID generation."""
        import re
        slug = name.lower()
        slug = re.sub(r'[^a-z0-9]+', '_', slug)
        slug = slug.strip('_')
        return slug[:50]  # Limit length

    # ===========================================
    # ACCESS GRANTS
    # ===========================================

    def create_grant(
        self,
        grantee_email: str,
        grant_type: str,
        target_value: str,
        granted_by: str,
        auto_cascade: bool = True,
        notes: str = None
    ) -> Dict[str, Any]:
        """
        Create a new access grant.
        If auto_cascade is True and grant_type is geographic, also create cascaded grants.
        """
        # Validate grant type
        if grant_type not in GRANT_TYPES:
            return {'status': 'error', 'message': f'Invalid grant type: {grant_type}'}

        # Check if grant already exists
        if self.grant_repo.grant_exists(grantee_email, grant_type, target_value):
            return {'status': 'exists', 'message': 'Grant already exists'}

        # Verify grantee exists
        grantee = self.db.query(User).filter(User.email == grantee_email).first()
        if not grantee:
            return {'status': 'error', 'message': f'User not found: {grantee_email}'}

        # Create the primary grant
        grant_data = {
            'grantee_email': grantee_email,
            'grant_type': grant_type,
            'target_value': target_value,
            'granted_by': granted_by,
            'is_cascaded': False,
            'notes': notes,
        }

        # Link to organization hierarchy if applicable
        if grant_type in GEOGRAPHIC_HIERARCHY:
            org_node = self.hierarchy_repo.get_by_name_and_type(target_value, grant_type)
            if org_node:
                grant_data['org_hierarchy_id'] = org_node.id

        primary_grant = self.grant_repo.create(grant_data)
        logger.info(f"Created access grant: {grantee_email} -> {grant_type}:{target_value}")

        # Auto-cascade for geographic grants
        cascaded_count = 0
        if auto_cascade and grant_type in GEOGRAPHIC_HIERARCHY:
            cascaded_count = self._cascade_geographic_grant(
                primary_grant, grantee_email, grant_type, target_value, granted_by
            )

        return {
            'status': 'success',
            'grant': primary_grant.to_dict(),
            'cascaded_grants': cascaded_count,
        }

    def _cascade_geographic_grant(
        self,
        parent_grant: UserAccessGrant,
        grantee_email: str,
        grant_type: str,
        target_value: str,
        granted_by: str
    ) -> int:
        """
        Create cascaded grants for a geographic grant.
        e.g., State grant -> cascades to all Regions, Cities, Stores within.
        """
        cascaded = 0
        type_index = GEOGRAPHIC_HIERARCHY.index(grant_type)

        # Get all users matching the target to find child entities
        users = self._get_users_by_geographic_filter(grant_type, target_value)

        # Extract child values from matching users
        child_values = {t: set() for t in GEOGRAPHIC_HIERARCHY[type_index + 1:]}

        for user in users:
            pd = user.profile_data or {}

            if 'region' in child_values:
                region = pd.get('Region')
                if region and str(region).strip():
                    child_values['region'].add(str(region).strip())

            if 'city' in child_values:
                city = pd.get('City')
                if city and str(city).strip():
                    child_values['city'].add(str(city).strip())

            if 'store' in child_values:
                store = user.store
                if store and str(store).strip() and str(store).lower() not in ['unassigned', 'nan']:
                    child_values['store'].add(str(store).strip())

        # Create cascaded grants
        for child_type, values in child_values.items():
            for val in values:
                if not self.grant_repo.grant_exists(grantee_email, child_type, val):
                    grant_data = {
                        'grantee_email': grantee_email,
                        'grant_type': child_type,
                        'target_value': val,
                        'granted_by': granted_by,
                        'is_cascaded': True,
                        'cascaded_from_id': parent_grant.id,
                    }

                    # Link to hierarchy
                    org_node = self.hierarchy_repo.get_by_name_and_type(val, child_type)
                    if org_node:
                        grant_data['org_hierarchy_id'] = org_node.id

                    self.grant_repo.create(grant_data)
                    cascaded += 1
                    logger.debug(f"Created cascaded grant: {grantee_email} -> {child_type}:{val}")

        logger.info(f"Created {cascaded} cascaded grants for {grantee_email}")
        return cascaded

    def _get_users_by_geographic_filter(self, filter_type: str, filter_value: str) -> List[User]:
        """Get users matching a geographic filter using in-memory cached users."""
        all_users = self._get_all_users()

        if filter_type == 'store':
            return [u for u in all_users if u.store == filter_value]

        # For state, region, city - filter by profile_data JSON
        key_map = {'state': 'State', 'region': 'Region', 'city': 'City'}
        key = key_map.get(filter_type)

        if key:
            return [
                u for u in all_users
                if (u.profile_data or {}).get(key) == filter_value
            ]

        return []

    def create_bulk_grants(
        self,
        grantee_email: str,
        grants: List[Dict[str, Any]],
        granted_by: str,
        auto_cascade: bool = True
    ) -> Dict[str, Any]:
        """
        Create multiple grants at once.
        Format: [{"type": "store", "values": ["Store A", "Store B"]}, ...]
        """
        grantee = self.db.query(User).filter(User.email == grantee_email).first()
        if not grantee:
            return {'status': 'error', 'message': f'User not found: {grantee_email}'}

        # 1. Cache all existing grants to prevent duplicate insertion lookups
        existing_grants = self.grant_repo.get_grants_for_user(grantee_email)
        existing_keys = {(g.grant_type, g.target_value) for g in existing_grants}

        # 2. Cache hierarchy map to quickly link geographic levels
        all_nodes = self.hierarchy_repo.get_all_active()
        hierarchy_map = {(n.type, n.name): n.id for n in all_nodes}

        # 3. Create all primary user-selected grants in memory
        primary_grants_to_add = []
        for grant_group in grants:
            grant_type = grant_group.get('type')
            if grant_type not in GRANT_TYPES:
                continue
            for value in grant_group.get('values', []):
                if (grant_type, value) not in existing_keys:
                    p_grant = UserAccessGrant(
                        grantee_email=grantee_email,
                        grant_type=grant_type,
                        target_value=value,
                        granted_by=granted_by,
                        is_cascaded=False,
                        org_hierarchy_id=hierarchy_map.get((grant_type, value))
                    )
                    primary_grants_to_add.append(p_grant)
                    existing_keys.add((grant_type, value))

        if not primary_grants_to_add:
            return {'status': 'success', 'total_created': 0, 'total_cascaded': 0, 'results': []}

        # Insert primary grants and flush to get IDs without a full write lock commit
        self.db.add_all(primary_grants_to_add)
        self.db.flush()

        # 4. Process cascades dynamically entirely inside our Python RAM layer
        cascaded_grants_to_add = []
        if auto_cascade:
            all_users = self._get_all_users()
            for p_grant in primary_grants_to_add:
                if p_grant.grant_type not in GEOGRAPHIC_HIERARCHY:
                    continue
                type_idx = GEOGRAPHIC_HIERARCHY.index(p_grant.grant_type)
                child_types = GEOGRAPHIC_HIERARCHY[type_idx + 1:]
                if not child_types:
                    continue

                if p_grant.grant_type == 'store':
                    users = [u for u in all_users if u.store == p_grant.target_value]
                else:
                    key_map = {'state': 'State', 'region': 'Region', 'city': 'City'}
                    key = key_map.get(p_grant.grant_type)
                    users = [u for u in all_users if (u.profile_data or {}).get(key) == p_grant.target_value] if key else []

                child_values = {t: set() for t in child_types}
                for u in users:
                    pd = u.profile_data or {}
                    if 'region' in child_values:
                        val = pd.get('Region')
                        if val and str(val).strip(): child_values['region'].add(str(val).strip())
                    if 'city' in child_values:
                        val = pd.get('City')
                        if val and str(val).strip(): child_values['city'].add(str(val).strip())
                    if 'store' in child_values:
                        val = u.store
                        if val and str(val).strip() and str(val).lower() not in ['unassigned', 'nan']:
                            child_values['store'].add(str(val).strip())

                for c_type, vals in child_values.items():
                    for val in vals:
                        if (c_type, val) not in existing_keys:
                            c_grant = UserAccessGrant(
                                grantee_email=grantee_email,
                                grant_type=c_type,
                                target_value=val,
                                granted_by=granted_by,
                                is_cascaded=True,
                                cascaded_from_id=p_grant.id,
                                org_hierarchy_id=hierarchy_map.get((c_type, val))
                            )
                            cascaded_grants_to_add.append(c_grant)
                            existing_keys.add((c_type, val))

        if cascaded_grants_to_add:
            self.db.add_all(cascaded_grants_to_add)

        # ONE singular massive database commit at the very end.
        self.db.commit()

        return {
            'status': 'success',
            'total_created': len(primary_grants_to_add),
            'total_cascaded': len(cascaded_grants_to_add),
            'results': [],
        }

    def get_grants_for_user(self, grantee_email: str) -> List[Dict]:
        """Get all grants for a user."""
        grants = self.grant_repo.get_grants_for_user(grantee_email)
        return [g.to_dict() for g in grants]

    def revoke_grant(self, grant_id: int) -> Dict[str, Any]:
        """Revoke a grant and its cascaded children."""
        grant = self.grant_repo.get_by_id(grant_id)
        if not grant:
            return {'status': 'not_found', 'message': 'Grant not found'}

        # Count cascaded grants that will be revoked
        cascaded = self.grant_repo.get_cascaded_grants(grant_id)
        cascaded_count = len(cascaded)

        success = self.grant_repo.revoke_grant(grant_id)
        if success:
            logger.info(f"Revoked grant {grant_id} and {cascaded_count} cascaded grants")
            return {
                'status': 'success',
                'revoked_cascaded': cascaded_count
            }

        return {'status': 'error', 'message': 'Failed to revoke grant'}

    def get_all_grants(self, skip: int = 0, limit: int = 100) -> List[Dict]:
        """Get all grants with pagination."""
        grants = self.grant_repo.get_all_grants(skip, limit)
        return [g.to_dict() for g in grants]

    def get_grants_summary(self) -> List[Dict]:
        """Get summary of grants grouped by user."""
        return self.grant_repo.get_grants_summary_by_user()

    # ===========================================
    # ACCESSIBLE USERS FILTERING
    # ===========================================

    def get_accessible_users(self, viewer_email: str) -> List[User]:
        """
        Get all users that a viewer has access to based on their grants.
        Superadmins bypass all access control and see everyone.
        Users with no grants can only see themselves.
        """
        # Check if viewer exists and is superadmin — use the cache to avoid a DB hit
        all_users_cached = self._get_all_users()
        viewer = next((u for u in all_users_cached if u.email == viewer_email), None)
        if not viewer:
            return []

        # Superadmin bypass — already have full list from cache
        if viewer.is_superadmin:
            return all_users_cached

        # Get all grants for this viewer
        grants = self.grant_repo.get_grants_for_user(viewer_email)

        if not grants:
            # No grants = can only see self
            return [viewer]

        # Build filter sets
        accessible_emails = {viewer_email}  # Always include self
        accessible_stores = set()
        accessible_cities = set()
        accessible_regions = set()
        accessible_states = set()
        accessible_departments = set()
        accessible_designations = set()
        accessible_roles = set()

        for grant in grants:
            if grant.grant_type == 'user':
                accessible_emails.add(grant.target_value)
            elif grant.grant_type == 'store':
                accessible_stores.add(grant.target_value)
            elif grant.grant_type == 'city':
                accessible_cities.add(grant.target_value)
            elif grant.grant_type == 'region':
                accessible_regions.add(grant.target_value)
            elif grant.grant_type == 'state':
                accessible_states.add(grant.target_value)
            elif grant.grant_type == 'department':
                accessible_departments.add(grant.target_value)
            elif grant.grant_type == 'designation':
                accessible_designations.add(grant.target_value)
            elif grant.grant_type == 'role':
                accessible_roles.add(grant.target_value)

        # Filter from the already-loaded cache
        accessible = []

        for user in all_users_cached:
            pd = user.profile_data or {}

            # Check each filter type (OR logic - match any grant)
            if user.email in accessible_emails:
                accessible.append(user)
                continue

            if user.store and user.store in accessible_stores:
                accessible.append(user)
                continue

            user_city = pd.get('City')
            if user_city and user_city in accessible_cities:
                accessible.append(user)
                continue

            user_region = pd.get('Region')
            if user_region and user_region in accessible_regions:
                accessible.append(user)
                continue

            user_state = pd.get('State')
            if user_state and user_state in accessible_states:
                accessible.append(user)
                continue

            user_dept = pd.get('Department')
            if user_dept and user_dept in accessible_departments:
                accessible.append(user)
                continue

            user_desig = pd.get('Designation')
            if user_desig and user_desig in accessible_designations:
                accessible.append(user)
                continue

            if user.role and user.role in accessible_roles:
                accessible.append(user)
                continue

        return accessible

    def get_accessible_user_emails(self, viewer_email: str) -> Set[str]:
        """Get set of accessible user emails for a viewer."""
        users = self.get_accessible_users(viewer_email)
        return {u.email for u in users}

    def filter_users_by_access(self, viewer_email: str, users: List[User]) -> List[User]:
        """Filter a list of users based on viewer's access grants."""
        accessible_emails = self.get_accessible_user_emails(viewer_email)
        return [u for u in users if u.email in accessible_emails]

    def check_access(self, viewer_email: str, target_email: str) -> bool:
        """Check if viewer has access to view target user's data."""
        accessible_emails = self.get_accessible_user_emails(viewer_email)
        return target_email in accessible_emails

    # ===========================================
    # FILTER OPTIONS
    # ===========================================

    def get_filter_options(self) -> Dict[str, List[str]]:
        """
        Get all available filter options for creating grants.
        Returns distinct values from users.
        """
        all_users = self._get_all_users()

        options = {
            'stores': set(),
            'cities': set(),
            'regions': set(),
            'states': set(),
            'departments': set(),
            'designations': set(),
            'roles': set(),
            'users': [],  # List of user dicts for user picker
        }

        invalid_values = {'nan', 'none', 'n/a', 'na', '', 'unassigned'}

        for user in all_users:
            # Add to user list
            options['users'].append({
                'email': user.email,
                'name': user.name,
                'role': user.role,
                'store': user.store,
            })

            # Extract filter values
            store = user.store
            if store and str(store).strip().lower() not in invalid_values:
                options['stores'].add(str(store).strip())

            role = user.role
            if role and str(role).strip().lower() not in invalid_values:
                options['roles'].add(str(role).strip())

            pd = user.profile_data or {}

            city = pd.get('City')
            if city and str(city).strip().lower() not in invalid_values:
                options['cities'].add(str(city).strip())

            region = pd.get('Region')
            if region and str(region).strip().lower() not in invalid_values:
                options['regions'].add(str(region).strip())

            state = pd.get('State')
            if state and str(state).strip().lower() not in invalid_values:
                options['states'].add(str(state).strip())

            dept = pd.get('Department')
            if dept and str(dept).strip().lower() not in invalid_values:
                options['departments'].add(str(dept).strip())

            desig = pd.get('Designation')
            if desig and str(desig).strip().lower() not in invalid_values:
                options['designations'].add(str(desig).strip())

        # Convert sets to sorted lists
        return {
            'stores': sorted(list(options['stores'])),
            'cities': sorted(list(options['cities'])),
            'regions': sorted(list(options['regions'])),
            'states': sorted(list(options['states'])),
            'departments': sorted(list(options['departments'])),
            'designations': sorted(list(options['designations'])),
            'roles': sorted(list(options['roles'])),
            'users': sorted(options['users'], key=lambda x: x['name']),
        }
