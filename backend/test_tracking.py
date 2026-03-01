import requests

API_URL = 'http://localhost:8000'
res = requests.post(f'{API_URL}/api/v1/auth/login-json', json={'email': 'superadmin', 'password': 'superadmin@2025'})
token = res.json().get('access_token')

loc_res = requests.get(f'{API_URL}/api/v1/tracking/location/all', headers={'Authorization': f'Bearer {token}'})
print('Status:', loc_res.status_code)
data = loc_res.json()
print('Count:', len(data))
for d in data:
    print(f"  {d.get('user_email')} | active={d.get('active')} | last_seen_minutes={d.get('last_seen_minutes')}")
