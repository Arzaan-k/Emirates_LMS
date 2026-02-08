
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

class ReportSubscriptionBase(BaseModel):
    report_type: str
    frequency: str = "weekly"
    day_of_week: str = "Monday"
    time_of_day: str = "09:00"
    format: str = "pdf"
    is_active: bool = True

class ReportSubscriptionCreate(ReportSubscriptionBase):
    pass

class ReportSubscriptionUpdate(ReportSubscriptionBase):
    pass

class ReportSubscriptionResponse(ReportSubscriptionBase):
    id: int
    user_id: int
    last_sent_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class SubscriptionListRequest(BaseModel):
    subscriptions: List[ReportSubscriptionCreate]
