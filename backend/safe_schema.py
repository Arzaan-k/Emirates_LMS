from app.config.database import engine
from app.models.base import Base

import app.models.access_control
import app.models.analytics
import app.models.assessment
import app.models.content
import app.models.crm
import app.models.daily_quiz
import app.models.meeting
import app.models.notification
import app.models.quiz
import app.models.report
import app.models.simulation
import app.models.system
import app.models.tracking
import app.models.user
import app.models.video_progress

print("Creating tables safely without App threads...")
try:
    Base.metadata.create_all(bind=engine)
    print("Finished safely!")
except Exception as e:
    print("Error:", e)
