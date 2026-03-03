from typing import Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.config.database import get_db
from app.core.dependencies import require_superadmin
from app.models.system import SystemSetting
from pydantic import BaseModel
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/system", tags=["System Settings"])

class SettingUpdate(BaseModel):
    key: str
    value_bool: bool = None
    value_json: dict = None
    value_str: str = None

@router.get("/settings")
def get_all_settings(db: Session = Depends(get_db)):
    """Get all public system settings. Accessible by anyone logged in or not, so frontend can adapt."""
    try:
        settings = db.query(SystemSetting).all()
        return {"settings": {s.key: s.to_dict() for s in settings}}
    except Exception as e:
        logger.error(f"Error fetching system settings: {e}")
        return {"settings": {}}

@router.post("/settings", dependencies=[Depends(require_superadmin)])
def update_setting(setting: SettingUpdate, db: Session = Depends(get_db)):
    """Update or create a system setting. Superadmin only."""
    try:
        db_setting = db.query(SystemSetting).filter(SystemSetting.key == setting.key).first()
        if not db_setting:
            db_setting = SystemSetting(
                key=setting.key,
                value_bool=setting.value_bool,
                value_json=setting.value_json,
                value_str=setting.value_str
            )
            db.add(db_setting)
        else:
            if setting.value_bool is not None:
                db_setting.value_bool = setting.value_bool
            if setting.value_json is not None:
                db_setting.value_json = setting.value_json
            if setting.value_str is not None:
                db_setting.value_str = setting.value_str
                
        db.commit()
        db.refresh(db_setting)
        return {"status": "success", "setting": db_setting.to_dict()}
    except Exception as e:
        logger.error(f"Error updating setting: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update setting")
