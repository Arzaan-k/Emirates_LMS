
# --- AI TRANSLATION --
class TranslateRequest(BaseModel):
    text: str
    target_language: str

@app.post("/ai/translate")
async def translate_text(req: TranslateRequest):
    try:
        # Use Groq for translation
        client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
        
        prompt = f"""
        Translate the following text into {req.target_language}.
        Preserve the original meaning and tone.
        Return ONLY the translated text, no preamble or explanation.
        
        Text to translate:
        {req.text}
        """
        
        completion = client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.3-70b-versatile",
            temperature=0.3
        )
        
        translated_text = completion.choices[0].message.content.strip()
        return {"translated_text": translated_text}
        
    except Exception as e:
        logger.error(f"Translation Error: {e}")
        raise HTTPException(status_code=500, detail="Translation failed")
