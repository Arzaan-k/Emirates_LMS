import requests

API_KEY = "sk_6ecd572e870639a9cb94b52be1b37f7d093d2857734c5a5a"
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
