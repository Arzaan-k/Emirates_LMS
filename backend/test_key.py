import os
from groq import Groq
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

API_KEY = os.environ.get("GROQ_API_KEY")
if not API_KEY:
    raise ValueError("GROQ_API_KEY not found in environment variables")

try:
    print(f"Testing API Key: {API_KEY[:4]}...{API_KEY[-4:]}")
    client = Groq(api_key=API_KEY)
    chat_completion = client.chat.completions.create(
        messages=[
            {
                "role": "user",
                "content": "Hello",
            }
        ],
        model="llama-3.3-70b-versatile",
    )
    print("API Key is working!")
    print(chat_completion.choices[0].message.content)
except Exception as e:
    print(f"API Key Failed: {e}")
