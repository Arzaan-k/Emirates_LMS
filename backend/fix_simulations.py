from sqlalchemy import create_engine, text
from app.config.settings import settings

def replace_db_airline():
    print('Connecting to DB...')
    engine = create_engine(settings.DATABASE_URL)
    with engine.connect() as conn:
        with conn.begin():
            # Update simulations title
            conn.execute(text("UPDATE simulations SET title = replace(title, 'Waffle', 'Service') WHERE title ILIKE '%Waffle%';"))
            conn.execute(text("UPDATE simulations SET title = replace(title, 'waffle', 'service') WHERE title ILIKE '%waffle%';"))
            
            # Update descriptions
            conn.execute(text("UPDATE simulations SET description = replace(description, 'Waffle', 'Airline') WHERE description ILIKE '%Waffle%';"))
            conn.execute(text("UPDATE simulations SET description = replace(description, 'waffle', 'flight') WHERE description ILIKE '%waffle%';"))
            
            # Update nodes (it's JSONB or JSON, but we can do a text replace if we cast)
            # A safer way is to fetch, parse, replace, save.
            res = conn.execute(text("SELECT id, nodes FROM simulations")).fetchall()
            import json
            for r in res:
                sim_id = r[0]
                nodes_data = r[1]
                if nodes_data:
                    nodes_str = json.dumps(nodes_data)
                    new_str = nodes_str.replace("Waffle", "Aircraft").replace("waffle", "passenger").replace("Nutella", "First Class").replace("Barista", "Cabin Crew").replace("barista", "cabin crew").replace("Soggy", "Delayed").replace("soggy", "delayed")
                    if new_str != nodes_str:
                        print(f"Updating nodes for {sim_id}")
                        conn.execute(text("UPDATE simulations SET nodes = :n WHERE id = :id"), {"n": new_str, "id": sim_id})
            
            # Also update category if applicable
            conn.execute(text("UPDATE simulations SET category = 'service' WHERE category = 'waffle';"))
    print('Done!')

replace_db_airline()
