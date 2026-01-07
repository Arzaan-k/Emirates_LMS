
import requests
import os

# Create a dummy video file if it doesn't exist
if not os.path.exists("test_debug_video.mp4"):
    with open("test_debug_video.mp4", "wb") as f:
        f.write(os.urandom(1024 * 1024)) # 1MB dummy file

url = "http://localhost:8000/resources/upload"
files = {'file': ('test_debug_video.mp4', open('test_debug_video.mp4', 'rb'), 'video/mp4')}
data = {
    'title': 'Debug Video Upload',
    'category': 'Debug',
    'description': 'Testing debug logs',
    'isPathNode': 'true' # Send as string 'true' which likely parses to boolean True in Pydantic or needs careful handling
}

print(f"Sending request to {url}...")
try:
    response = requests.post(url, files=files, data=data)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
except Exception as e:
    print(f"Error: {e}")
