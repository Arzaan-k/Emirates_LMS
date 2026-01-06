try:
    import whisper
    print("SUCCESS: Whisper imported")
    # m = whisper.load_model("base") 
    # print("Whisper model loaded") 
except ImportError as e:
    print(f"ERROR: Whisper import failed: {e}")
except Exception as e:
    print(f"ERROR: Whisper generic error: {e}")

try:
    from moviepy.editor import VideoFileClip
    print("SUCCESS: MoviePy imported")
    import moviepy.config as conf
    print(f"MoviePy FFMPEG Binary: {conf.get_setting('FFMPEG_BINARY')}")
except ImportError as e:
    print(f"ERROR: MoviePy import failed: {e}")
except Exception as e:
    print(f"ERROR: MoviePy generic error: {e}")
