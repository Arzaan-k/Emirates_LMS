import sys
import pkgutil
from sqlalchemy import create_engine, text
from sqlalchemy.schema import CreateTable
from sqlalchemy.exc import ProgrammingError, OperationalError

db_url = "postgresql://neondb_owner:npg_qHdk6eC4NOiR@35.171.11.169/neondb?sslmode=require&options=project%3Dep-orange-mode-a49fkl98-pooler"
engine = create_engine(db_url).execution_options(isolation_level="AUTOCOMMIT")

print('Importing models...')
import app.models.user
import app.models.content
import app.models.quiz
import app.models.simulation
import app.models.tracking
import app.models.daily_quiz
import app.models.analytics
import app.models.assessment
import app.models.crm
import app.models.meeting
import app.models.notification
import app.models.report
import app.models.system
import app.models.video_progress
import app.models.access_control
from app.models.base import Base

def build_schema():
    print('Generating definitions...')
    queries = []
    
    for name, table in Base.metadata.tables.items():
        create_sql = str(CreateTable(table).compile(engine))
        queries.append((name, create_sql))
        
    print(f'Discovered {len(queries)} tables.')
    
    with engine.connect() as conn:
        for idx, (name, q) in enumerate(queries):
            try:
                conn.execute(text(q))
                print(f"[{idx+1}/{len(queries)}] Created table {name}")
            except (ProgrammingError, OperationalError) as e:
                # If table already exists, ignore
                if 'already exists' in str(e):
                    print(f"[{idx+1}/{len(queries)}] Table {name} already exists.")
                else:
                    print(f"[{idx+1}/{len(queries)}] Error on {name}: {e}")

if __name__ == '__main__':
    build_schema()
