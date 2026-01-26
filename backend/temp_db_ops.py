
# ==========================================
# ACCESS RULE OPERATIONS
# ==========================================

def get_access_rule_by_level(db: Session, level_name: str) -> Optional[AccessRule]:
    """Get access rule for a specific level"""
    return db.query(AccessRule).filter(AccessRule.level_name == level_name).first()

def create_or_update_access_rule(db: Session, level_name: str, courses: list, buckets: list, max_visible: int) -> AccessRule:
    """Create or update access rule"""
    rule = get_access_rule_by_level(db, level_name)
    if not rule:
        rule = AccessRule(level_name=level_name)
        db.add(rule)
    
    rule.accessible_courses = courses
    rule.accessible_buckets = buckets
    rule.max_courses_visible = max_visible
    rule.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(rule)
    return rule
