"""
Test script to verify support ticket endpoints
Confirms that backward compatibility aliases are working correctly
"""

from fastapi.testclient import TestClient
from app.main import app


def test_support_categories():
    """Test that support categories endpoint works"""
    print("=" * 70)
    print("SUPPORT ENDPOINTS VERIFICATION")
    print("=" * 70)

    client = TestClient(app)

    # Test the backward compatibility alias
    response = client.get("/api/v1/support/categories")
    print(f"\n[TEST] GET /api/v1/support/categories")
    print(f"Status Code: {response.status_code}")

    if response.status_code == 200:
        categories = response.json()
        print(f"[PASS] Retrieved {len(categories)} support categories")
        for cat in categories:
            print(f"  - {cat['name']} ({cat['id']})")
        return True
    else:
        print(f"[FAIL] Expected 200, got {response.status_code}")
        print(f"Response: {response.text}")
        return False


def test_my_tickets_endpoint():
    """Test the my-tickets endpoint"""
    print(f"\n[TEST] GET /api/v1/support/my-tickets/superadmin")

    client = TestClient(app)
    response = client.get("/api/v1/support/my-tickets/superadmin")

    print(f"Status Code: {response.status_code}")

    if response.status_code == 200:
        tickets = response.json()
        print(f"[PASS] Retrieved {len(tickets)} support tickets for superadmin")
        if len(tickets) > 0:
            print(f"  Sample ticket: {tickets[0].get('subject', 'N/A')}")
        return True
    else:
        print(f"[FAIL] Expected 200, got {response.status_code}")
        print(f"Response: {response.text}")
        return False


def test_original_endpoints():
    """Test that original endpoints still work"""
    print(f"\n[TEST] Original endpoints still functional")

    client = TestClient(app)

    # Test original notifications/support/categories endpoint
    response1 = client.get("/api/v1/notifications/support/categories")
    print(f"GET /api/v1/notifications/support/categories: {response1.status_code}")

    # Test original notifications/support/user endpoint
    response2 = client.get("/api/v1/notifications/support/user/test@example.com")
    print(f"GET /api/v1/notifications/support/user/test@example.com: {response2.status_code}")

    if response1.status_code == 200 and response2.status_code == 200:
        print("[PASS] Original endpoints working correctly")
        return True
    else:
        print("[FAIL] Original endpoints not working as expected")
        return False


def run_all_tests():
    """Run all support endpoint tests"""
    print("\n")

    try:
        test1 = test_support_categories()
        test2 = test_my_tickets_endpoint()
        test3 = test_original_endpoints()

        print("\n" + "=" * 70)
        if test1 and test2 and test3:
            print("[SUCCESS] ALL SUPPORT ENDPOINT TESTS PASSED")
            print("=" * 70)
            print("\nSupport feature is now fully functional:")
            print("  [OK] Support categories endpoint working")
            print("  [OK] My tickets endpoint working")
            print("  [OK] Backward compatibility aliases active")
            print("  [OK] Original endpoints still functional")
            print("\nThe LMS Support feature is ready to use!")
            return True
        else:
            print("[PARTIAL] Some tests failed")
            print("=" * 70)
            return False

    except Exception as e:
        print(f"\n[ERROR] {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = run_all_tests()
    exit(0 if success else 1)
