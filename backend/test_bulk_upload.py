import requests
import json
import time

URL = "http://localhost:8001/api/v1/content"

# 1. Create a dummy file
with open("test_upload_file.txt", "w") as f:
    f.write("Test content for bulk upload verification")

print("Created test_upload_file.txt")

# 2. Upload file (Bypass auth used in dependencies.py)
print("\n--- Starting Bulk Upload ---")
bulk_url = f"{URL}/bulk-upload-folder/"

files = {
    'files': ('test_upload_file.txt', open('test_upload_file.txt', 'rb'), 'text/plain')
}
data = {
    "file_paths": json.dumps(["RootBucket/test_upload_file.txt"]),
    "root_bucket_name": "TestBucketResult",
    "learning_path_type": "career_progression",
    "skip_duplicates": "false"
}

try:
    response = requests.post(bulk_url, files=files, data=data) # No auth header needed due to bypass
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")

    if response.status_code == 200:
        res_json = response.json()
        print("Upload success.")
        items = res_json.get("items", [])
        
        if items:
            item = items[0]
            content_id = item.get("id")
            print(f"Uploaded Content ID: {content_id}")
            print(f"Initial Status from response: {item.get('status')}")

            # 3. Poll for status
            if content_id:
                print("\n--- Polling Status ---")
                for i in range(10):
                    time.sleep(2)
                    status_url = f"{URL}/{content_id}"
                    status_res = requests.get(status_url)
                    if status_res.status_code == 200:
                        content_data = status_res.json()
                        current_status = content_data.get("processing_status")
                        extra_data = content_data.get("extra_data", {})
                        
                        print(f"Attempt {i+1}: Status={current_status}, ExtraData={extra_data}")
                        
                        if current_status == "ready":
                            print("SUCCESS: Content is ready!")
                            break
                        elif current_status == "failed":
                            print("FAILURE: Content processing failed.")
                            break
                    else:
                        print(f"Error fetching content: {status_res.status_code}")
            else:
                print("No content ID returned in items.")
        else:
            print("No items returned in response.")
    else:
        print("Upload failed.")

except Exception as e:
    print(f"Request failed: {e}")
