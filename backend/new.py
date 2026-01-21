import requests
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

API_KEY = os.environ.get("ELEVENLABS_API_KEY")
if not API_KEY:
    raise ValueError("ELEVENLABS_API_KEY not found in environment variables")

VOICE_ID = "Y6nOpHQlW4lnf9GRRc8f"  # Best emotive Hindi voice
URL = f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}"

headers = {
    "xi-api-key": API_KEY,
    "Content-Type": "application/json"
}

data = {
    "text": "Maine teen baar customer care ko phone kiya hai! Har baar bas wait karaya ja raha hai!",
    "model_id": "eleven_multilingual_v2",
    "voice_settings": {
        "stability": 0.25,
        "similarity_boost": 0.7,
        "style": 0.85,
        "use_speaker_boost": True
    }
}

response = requests.post(URL, json=data, headers=headers)

with open("angry_customer_hindi.mp3", "wb") as f:
    f.write(response.content)

print("Voice generated: angry_customer_hindi.mp3")
