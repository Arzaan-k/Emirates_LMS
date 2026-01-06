import os
from moviepy.editor import ColorClip
from faster_whisper import WhisperModel
from groq import Groq
import datetime

def test_pipeline():
    print("1. Testing MoviePy (Video Creation)...")
    try:
        # Create dummy video
        clip = ColorClip(size=(640, 480), color=(255, 0, 0), duration=2)
        clip.fps = 24
        clip.write_videofile("test_video.mp4", logger=None)
        print("   - Video created successfully.")
    except Exception as e:
        print(f"   - FAILED to create video: {e}")
        return

    print("\n2. Testing Audio Extraction...")
    try:
        from moviepy.editor import VideoFileClip
        video = VideoFileClip("test_video.mp4")
        audio_path = "test_audio.mp3"
        video.audio.write_audiofile(audio_path, logger=None)
        video.close()
        print("   - Audio extracted successfully.")
    except Exception as e:
        print(f"   - FAILED to extract audio: {e}")
        return

    print("\n3. Testing Whisper Transcription...")
    try:
        model = WhisperModel("base", device="cpu", compute_type="int8")
        segments, info = model.transcribe(audio_path, beam_size=5)
        text = "".join([s.text for s in segments])
        print(f"   - Transcription successful (Length: {len(text)})")
    except Exception as e:
        print(f"   - FAILED to transcribe: {e}")
        return

    print("\n4. Testing Groq Quiz Gen...")
    try:
        client = Groq(api_key="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")
        chat_completion = client.chat.completions.create(
            messages=[
                {
                    "role": "user",
                    "content": "Generate a JSON quiz for: Python is a programming language.",
                }
            ],
            model="llama-3.3-70b-versatile",
            response_format={"type": "json_object"},
        )
        print("   - Groq response received.")
    except Exception as e:
        print(f"   - FAILED Groq: {e}")
        return

    print("\nSUCCESS: All components are working.")
    
    # Cleanup
    if os.path.exists("test_video.mp4"): os.remove("test_video.mp4")
    if os.path.exists("test_audio.mp3"): os.remove("test_audio.mp3")

if __name__ == "__main__":
    test_pipeline()
