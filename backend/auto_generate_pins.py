"""
Auto-generate PINs for exams based on scheduled time.
This script should be run periodically (e.g., every minute via cron job or scheduler).
"""

import sys
import codecs
from datetime import datetime, timedelta
import random
import logging

# Set UTF-8 encoding for Windows console
if sys.platform == 'win32':
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.config.settings import settings
from app.models.assessment import ScheduledExam

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def auto_generate_pins():
    """
    Check for exams that need PIN generation and generate PINs automatically.

    Logic:
    - Find exams where pin_enabled = True
    - Check if current time is within the generation window (e.g., 5 minutes before exam_time)
    - If PIN not yet generated or expired, generate new PIN
    """
    try:
        # Create database connection
        engine = create_engine(settings.DATABASE_URL)
        Session = sessionmaker(bind=engine)
        db = Session()

        now = datetime.utcnow()
        logger.info(f"🔍 Checking for exams needing PIN generation at {now}")

        # Find all PIN-enabled exams
        exams = db.query(ScheduledExam).filter(
            ScheduledExam.pin_enabled == True
        ).all()

        logger.info(f"📋 Found {len(exams)} PIN-enabled exams")

        generated_count = 0

        for exam in exams:
            try:
                # Parse exam date and time
                exam_datetime_str = f"{exam.exam_date} {exam.exam_time}"
                exam_datetime = datetime.strptime(exam_datetime_str, "%Y-%m-%d %H:%M")

                # Calculate generation time (X minutes before exam)
                generation_minutes = exam.pin_generation_minutes or 5
                generation_time = exam_datetime - timedelta(minutes=generation_minutes)

                # Check if we're within generation window
                # Generate if: current time >= generation_time AND current time < exam_datetime
                if generation_time <= now <= exam_datetime:
                    # Check if PIN already exists and is still valid
                    if exam.generated_pin and exam.pin_generated_at:
                        validity_minutes = exam.pin_validity_minutes or 30
                        expiry_time = exam.pin_generated_at + timedelta(minutes=validity_minutes)

                        if now < expiry_time:
                            # PIN still valid, skip
                            logger.info(f"⏭️  Exam {exam.title} ({exam.id}): PIN already valid, skipping")
                            continue

                    # Generate new PIN
                    pin = str(random.randint(1000, 9999))
                    exam.generated_pin = pin
                    exam.pin_generated_at = now
                    db.commit()

                    generated_count += 1
                    validity_minutes = exam.pin_validity_minutes or 30
                    valid_until = now + timedelta(minutes=validity_minutes)

                    logger.info(
                        f"✅ Generated PIN {pin} for exam '{exam.title}' ({exam.id})\n"
                        f"   Exam time: {exam_datetime}\n"
                        f"   Valid until: {valid_until}"
                    )
                elif now < generation_time:
                    logger.debug(f"⏰ Exam {exam.title} ({exam.id}): Too early to generate (generation at {generation_time})")
                else:
                    logger.debug(f"⏱️  Exam {exam.title} ({exam.id}): Exam time passed")

            except Exception as e:
                logger.error(f"❌ Error processing exam {exam.id}: {e}")
                continue

        db.close()

        if generated_count > 0:
            logger.info(f"🎉 Successfully generated {generated_count} PIN(s)")
        else:
            logger.info("✓ No PINs needed to be generated at this time")

        return generated_count

    except Exception as e:
        logger.error(f"❌ Auto-generation failed: {e}")
        raise


if __name__ == "__main__":
    auto_generate_pins()
