# Backend Setup Guide

## Environment Configuration

This application uses environment variables to securely store API keys and configuration values.

### Step 1: Create .env File

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Open `.env` in your text editor and fill in your actual API keys:
   ```bash
   GROQ_API_KEY=your_actual_groq_api_key_here
   ELEVENLABS_API_KEY=your_actual_elevenlabs_api_key_here
   ELEVENLABS_VOICE_ID=3AMU7jXQuQa3oRvRqUmb
   ```

### Step 2: Install Dependencies

```bash
pip install -r requirements.txt
```

This will install all required packages including `python-dotenv` for environment variable management.

### Step 3: Run the Server

```bash
uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

## Getting API Keys

### Groq API Key
1. Visit [https://console.groq.com](https://console.groq.com)
2. Sign up or log in
3. Navigate to API Keys section
4. Create a new API key
5. Copy the key (starts with `gsk_`)

### ElevenLabs API Key
1. Visit [https://elevenlabs.io](https://elevenlabs.io)
2. Sign up or log in
3. Go to Profile > API Keys
4. Create a new API key
5. Copy the key (starts with `sk_`)

## Security Notes

- **NEVER** commit the `.env` file to version control
- The `.env` file is already included in `.gitignore`
- For production deployment (Render, etc.), set environment variables in the platform's dashboard
- Only share `.env.example` (which contains no real keys)

## Troubleshooting

### "GROQ_API_KEY environment variable is not set"
- Make sure `.env` file exists in the backend directory
- Verify the API key is correctly set in `.env`
- Check that there are no extra spaces or quotes around the key

### "ELEVENLABS_API_KEY environment variable is not set"
- Same as above, but for ElevenLabs key
- Ensure the key starts with `sk_`

### Environment variables not loading
- Make sure `python-dotenv` is installed: `pip install python-dotenv`
- Verify `.env` file is in the same directory as `server.py`
- Check that there are no syntax errors in `.env` (no quotes needed around values)
