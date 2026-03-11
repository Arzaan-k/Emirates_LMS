"""
Quick test script to verify quiz translation endpoint
Run this to test if translation is working on the backend
"""

import requests
import json
import sys

# Fix Windows console encoding
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

BASE_URL = "http://192.168.1.23:8000"

def test_translation():
    print("=" * 60)
    print("Testing Quiz Translation Endpoint")
    print("=" * 60)

    # Step 1: Get list of quizzes
    print("\n1. Fetching available quizzes...")
    response = requests.get(f"{BASE_URL}/api/v1/quizzes")
    if response.status_code == 200:
        quizzes = response.json()
        if quizzes:
            quiz_id = quizzes[0].get('id')
            print(f"✓ Found quiz: {quiz_id}")
        else:
            print("✗ No quizzes found in database")
            return
    else:
        print(f"✗ Failed to fetch quizzes: {response.status_code}")
        return

    # Step 2: Get quiz in English (original)
    print(f"\n2. Fetching quiz {quiz_id} in English...")
    response = requests.get(f"{BASE_URL}/api/v1/quizzes/{quiz_id}")
    if response.status_code == 200:
        quiz_en = response.json()
        print(f"✓ English title: {quiz_en.get('title')}")
        if quiz_en.get('questions'):
            print(f"✓ First question (EN): {quiz_en['questions'][0].get('question', '')[:80]}...")
    else:
        print(f"✗ Failed to fetch English quiz: {response.status_code}")
        return

    # Step 3: Translate quiz to Hindi
    print(f"\n3. Translating quiz {quiz_id} to Hindi...")
    response = requests.get(f"{BASE_URL}/api/v1/quizzes/{quiz_id}?language=Hindi")
    print(f"   Response status: {response.status_code}")

    if response.status_code == 200:
        quiz_hi = response.json()
        print(f"✓ Hindi title: {quiz_hi.get('title')}")
        if quiz_hi.get('questions'):
            print(f"✓ First question (HI): {quiz_hi['questions'][0].get('question', '')[:80]}...")
        print(f"✓ Translated to: {quiz_hi.get('translated_to', 'N/A')}")

        # Compare
        if quiz_en.get('title') != quiz_hi.get('title'):
            print("\n✓✓✓ TRANSLATION SUCCESSFUL! Title changed.")
        else:
            print("\n✗✗✗ TRANSLATION FAILED! Title unchanged.")
    else:
        print(f"✗ Failed to translate quiz: {response.status_code}")
        print(f"   Response: {response.text[:200]}")

    # Step 4: Test Spanish translation
    print(f"\n4. Translating quiz {quiz_id} to Spanish...")
    response = requests.get(f"{BASE_URL}/api/v1/quizzes/{quiz_id}?language=Spanish")
    if response.status_code == 200:
        quiz_es = response.json()
        print(f"✓ Spanish title: {quiz_es.get('title')}")
        if quiz_es.get('questions'):
            print(f"✓ First question (ES): {quiz_es['questions'][0].get('question', '')[:80]}...")
    else:
        print(f"✗ Failed to translate to Spanish: {response.status_code}")

    print("\n" + "=" * 60)
    print("Test complete!")
    print("=" * 60)

if __name__ == "__main__":
    try:
        test_translation()
    except Exception as e:
        print(f"\n✗✗✗ ERROR: {e}")
        import traceback
        traceback.print_exc()
