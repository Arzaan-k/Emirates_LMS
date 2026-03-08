import sys
import uuid
import datetime

print('Importing app.main to load models...')
try:
    import app.main
except Exception as e:
    pass

from sqlalchemy.orm import Session
from app.config.database import SessionLocal, engine
from sqlalchemy import text
from app.models.base import Base
from app.models.user import User
from app.models.content import CourseBucket as Bucket, Resource as LibraryResource
from app.models.simulation import Simulation

def seed_db():
    print('Connecting to DB to insert records...')

    db = SessionLocal()
    try:
        print("Creating admin user...")
        admin_email = "admin@emirates.com"
        admin = db.query(User).filter(User.email == admin_email).first()
        if not admin:
            # Note: id is auto-increment Integer. password should be hashed but using dummy for seed.
            admin = User(
                email=admin_email,
                name="Emirates Admin",
                password="hashed_password_here",
                role="SuperAdmin",
                category="Employee",
                is_superadmin=True,
                has_admin_access=True,
                store="Global"
            )
            db.add(admin)
            
        print("Creating basic users...")
        user1 = db.query(User).filter(User.email == "crew@emirates.com").first()
        if not user1:
            user1 = User(
                email="crew@emirates.com",
                name="Sarah Flight",
                password="hashed_password_here",
                role="Crew Member",
                category="Employee",
                store="DXB01"
            )
            db.add(user1)

        print("Creating Aviation buckets...")
        b1 = db.query(Bucket).filter(Bucket.name == "In-Flight Services (Self-Learning)").first()
        if not b1:
            b1 = Bucket(
                id=f"bucket_{uuid.uuid4().hex[:8]}",
                name="In-Flight Services (Self-Learning)",
                description="Learn the premium standard of Emirates in-flight service and hospitality",
                learning_path_type="self_learning",
                icon="✈️",
                show_in_both_paths=False
            )
            db.add(b1)
            
        b2 = db.query(Bucket).filter(Bucket.name == "Aviation Safety (Self-Learning)").first()
        if not b2:
            b2 = Bucket(
                id=f"bucket_{uuid.uuid4().hex[:8]}",
                name="Aviation Safety (Self-Learning)",
                description="Critical safety and emergency procedures for all flights",
                learning_path_type="self_learning",
                icon="🛡️",
                show_in_both_paths=False
            )
            db.add(b2)

        print("Creating library resources...")
        r1 = db.query(LibraryResource).filter(LibraryResource.title == "B777 Emergency Protocol").first()
        if not r1:
            r1 = LibraryResource(
                id=f"lib_{uuid.uuid4().hex[:8]}",
                title="B777 Emergency Protocol",
                description="Comprehensive guide for Boeing 777 emergency situations and passenger evacuation.",
                category="Safety Manuals",
                resource_type="PDF",
                url="https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
                download_count=0,
                is_active=True
            )
            db.add(r1)

        print("Creating simulations...")
        sim1 = db.query(Simulation).filter(Simulation.title == "Handling Delays and Upset Passengers").first()
        if not sim1:
            sim1 = Simulation(
                id="sim_emirates_1",
                title="Handling Delays and Upset Passengers",
                description="A flight from Dubai to London is delayed by 3 hours. Deal with a frustrated First Class passenger efficiently.",
                category="operations",
                difficulty="hard",
                is_active=True,
                duration="15 min",
                duration_minutes=15,
                thumbnail="https://images.unsplash.com/photo-1436491865332-7a61a109cc05?q=80&w=2000&auto=format&fit=crop",
                start_node_id="start",
                total_branches=4,
                max_score=100.0,
                nodes=[
                    {
                        "id": "start",
                        "title": "Angry Passenger Approaches",
                        "description": "Mr. Smith is highly upset about missing his connecting flight. How do you respond?",
                        "isStart": True,
                        "options": [
                            { "id": "opt1", "text": "Apologize immediately and offer lounge access.", "isCorrect": True, "nextNodeId": "lounge_offer" },
                            { "id": "opt2", "text": "Tell him it is out of your control.", "isCorrect": False, "consequence": "Passenger becomes enraged and demands a manager immediately.", "nextNodeId": "manager_called" }
                        ]
                    },
                    {
                        "id": "lounge_offer",
                        "title": "Lounge Offer Accepted",
                        "description": "Mr. Smith accepts. What is your next step?",
                        "isStart": False,
                        "options": [
                            { "id": "opt3", "text": "Rebook him on the next flight.", "isCorrect": True, "nextNodeId": "success" },
                            { "id": "opt4", "text": "Ask him to check back later.", "isCorrect": False, "nextNodeId": "fail" }
                        ]
                    },
                    { "id": "manager_called", "title": "Manager called", "description": "Poor service", "isStart": False, "options": [] },
                    { "id": "success", "title": "Success", "description": "Good job", "isStart": False, "options": [] },
                    { "id": "fail", "title": "Failed", "description": "Missed connection again", "isStart": False, "options": [] }
                ]
            )
            db.add(sim1)
            
        sim2 = db.query(Simulation).filter(Simulation.title == "Emergency Evacuation Briefing").first()
        if not sim2:
            sim2 = Simulation(
                id="sim_emirates_2",
                title="Emergency Evacuation Briefing",
                description="Practice the pre-flight safety demonstration.",
                category="safety",
                difficulty="medium",
                is_active=True,
                duration="10 min",
                duration_minutes=10,
                thumbnail="https://images.unsplash.com/photo-1540339832862-4745ea9842bf?q=80&w=2000&auto=format&fit=crop",
                start_node_id="start",
                total_branches=3,
                max_score=100.0,
                nodes=[
                    {
                        "id": "start",
                        "title": "Passenger Using Laptop During Taxi",
                        "description": "A passenger refuses to put away their large laptop during taxiing.",
                        "isStart": True,
                        "options": [
                            { "id": "opt1", "text": "Firmly but politely ask them to stow it.", "isCorrect": True, "nextNodeId": "success" },
                            { "id": "opt2", "text": "Ignore it.", "isCorrect": False, "consequence": "Major safety violation.", "nextNodeId": "fail" }
                        ]
                    },
                    { "id": "success", "title": "Safety Secured", "description": "Good job", "isStart": False, "options": [] },
                    { "id": "fail", "title": "Safety Violation", "description": "Failed", "isStart": False, "options": [] }
                ]
            )
            db.add(sim2)

        db.commit()
        print("Database seeded successfully with Emirates mock data!")
        
    except Exception as e:
        db.rollback()
        import traceback
        traceback.print_exc()
        print(f"Error seeding database: {e}")
    finally:
        db.close()

if __name__ == '__main__':
    seed_db()
