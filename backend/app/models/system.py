from sqlalchemy import Column, String, Boolean, JSON
from app.models.base import Base

class SystemSetting(Base):
    """
    Global system settings for the application.
    Examples: allow_screenshots, maintenance_mode, etc.
    """
    __tablename__ = "system_settings"
    
    key = Column(String(100), primary_key=True, index=True)
    value_bool = Column(Boolean, nullable=True)
    value_json = Column(JSON, nullable=True)
    value_str = Column(String(255), nullable=True)

    def to_dict(self):
        return {
            "key": self.key,
            "value_bool": self.value_bool,
            "value_json": self.value_json,
            "value_str": self.value_str
        }
