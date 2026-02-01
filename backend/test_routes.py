from app.main import app
from fastapi.routing import APIRoute

print('App loaded successfully')
routes = [r for r in app.routes if isinstance(r, APIRoute)]
learning_routes = [r for r in routes if 'learning' in r.path.lower()]
print(f'Learning path routes: {len(learning_routes)}')
for r in learning_routes:
    methods = list(r.methods)
    print(f'  {methods} {r.path}')
