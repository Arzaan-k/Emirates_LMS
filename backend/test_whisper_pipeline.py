import os
from moviepy.editor import ColorClip
import whisper
import logging

# Configure basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("TestPipeline")

def test_whisper_pipeline():
    print("1. Testing MoviePy (Video Creation with logger=None)...")
    try:
        # Create dummy video with audio
        clip = ColorClip(size=(640, 480), color=(0, 255, 0), duration=2)
        from moviepy.audio.AudioClip import AudioArrayClip
        import numpy as np
        # 2 seconds of silence
        arr = np.zeros((44100 * 2, 2))
        audio = AudioArrayClip(arr, fps=44100)
        clip = clip.set_audio(audio)
        
        clip.fps = 24
        # KEY FIX: logger=None
        clip.write_videofile("test_whisper_video.mp4", codec="libx264", audio_codec="aac", logger=None) 
        print("   - Video created successfully.")
    except Exception as e:
        print(f"   - FAILED to create video: {e}")
        return

    print("\n2. Testing Audio Extraction...")
    try:
        from moviepy.editor import VideoFileClip
        video = VideoFileClip("test_whisper_video.mp4")
        audio_path = "test_whisper_audio.mp3"
        video.audio.write_audiofile(audio_path, logger=None)
        video.close()
        print("   - Audio extracted successfully.")
    except Exception as e:
        print(f"   - FAILED to extract audio: {e}")
        return

    print("\n3. Testing OpenAI Whisper Transcription...")
    try:
        print("   - Loading model...")
        model = whisper.load_model("base")
        print("   - Transcribing...")
        # KEY CHANGE: result = model.transcribe(path)
        result = model.transcribe(audio_path)
        text = result["text"]
        print(f"   - Transcription successful: '{text.strip()}'")
    except Exception as e:
        print(f"   - FAILED to transcribe: {e}")
        import traceback
        traceback.print_exc()
        return

    print("\nSUCCESS: Whisper pipeline is working.")
    
    # Cleanup
    if os.path.exists("test_whisper_video.mp4"): os.remove("test_whisper_video.mp4")
    if os.path.exists("test_whisper_audio.mp3"): os.remove("test_whisper_audio.mp3")

if __name__ == "__main__":
    test_whisper_pipeline()
