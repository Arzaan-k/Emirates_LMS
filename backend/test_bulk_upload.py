"""
Test script for bulk upload employee code validation endpoint
Run: python test_bulk_upload.py
"""

import requests
import json

# Configuration
API_URL = "http://localhost:8000"
ENDPOINT = f"{API_URL}/api/v1/users/validate-employee-codes"

def test_endpoint():
    print("=" * 60)
    print("🧪 TESTING BULK UPLOAD ENDPOINT")
    print("=" * 60)

    # Test Case 1: Valid employee codes (these should exist in your DB)
    print("\n📋 Test 1: Validating sample employee codes...")
    test_codes_1 = ["BWCO-0028", "BWCO-0029", "BWCO-0030"]

    try:
        response = requests.post(
            ENDPOINT,
            json={"employee_codes": test_codes_1},
            headers={"Content-Type": "application/json"}
        )

        print(f"Status Code: {response.status_code}")

        if response.status_code == 200:
            data = response.json()
            print(f"✅ Success!")
            print(f"   Matched: {data['matched_count']} users")
            print(f"   Not Found: {data['not_found_count']} codes")
            print(f"   Matched Emails: {data['matched'][:3]}...")  # Show first 3
            if data['not_found']:
                print(f"   Not Found Codes: {data['not_found']}")
        else:
            print(f"❌ Error: {response.text}")

    except requests.exceptions.ConnectionError:
        print("❌ ERROR: Cannot connect to backend.")
        print("   Make sure backend server is running on http://localhost:8000")
        return False
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False

    # Test Case 2: Mix of valid and invalid codes
    print("\n📋 Test 2: Mix of valid and invalid codes...")
    test_codes_2 = ["BWCO-0028", "INVALID-9999", "BWCO-0029"]

    try:
        response = requests.post(
            ENDPOINT,
            json={"employee_codes": test_codes_2},
            headers={"Content-Type": "application/json"}
        )

        if response.status_code == 200:
            data = response.json()
            print(f"✅ Partial match handled correctly!")
            print(f"   Matched: {data['matched_count']}/{data['total_codes']}")
            print(f"   Not Found: {data['not_found']}")

    except Exception as e:
        print(f"❌ ERROR: {e}")

    # Test Case 3: Empty array
    print("\n📋 Test 3: Empty employee codes array...")

    try:
        response = requests.post(
            ENDPOINT,
            json={"employee_codes": []},
            headers={"Content-Type": "application/json"}
        )

        if response.status_code == 400:
            print(f"✅ Correctly rejected empty array (400 Bad Request)")
        else:
            print(f"⚠️  Unexpected status: {response.status_code}")

    except Exception as e:
        print(f"❌ ERROR: {e}")

    # Test Case 4: Get actual user emails to test with
    print("\n📋 Test 4: Fetching actual users from database...")

    try:
        users_response = requests.get(f"{API_URL}/api/v1/users/list")
        if users_response.status_code == 200:
            users = users_response.json().get('users', [])
            print(f"✅ Found {len(users)} users in database")

            # Check if users have employee codes in profile_data
            users_with_codes = [
                u for u in users
                if u.get('profile_data') and
                (u['profile_data'].get('employee_code') or u['profile_data'].get('Employee Code'))
            ]

            print(f"   Users with employee codes: {len(users_with_codes)}")

            if users_with_codes:
                sample_user = users_with_codes[0]
                emp_code = (sample_user['profile_data'].get('employee_code') or
                           sample_user['profile_data'].get('Employee Code'))
                print(f"   Sample: {emp_code} → {sample_user['email']}")

    except Exception as e:
        print(f"⚠️  Could not fetch users: {e}")

    print("\n" + "=" * 60)
    print("✅ ALL TESTS COMPLETED")
    print("=" * 60)
    print("\n💡 Next Steps:")
    print("   1. Start your backend server if not running")
    print("   2. Test the feature in the mobile app")
    print("   3. Upload a sample Excel/CSV file")
    print("   4. Verify users are auto-selected")
    print("\n📖 See BULK_UPLOAD_FEATURE.md for full documentation")

    return True

if __name__ == "__main__":
    test_endpoint()
