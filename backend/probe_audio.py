from moviepy.editor import ColorClip
import traceback

def test_audio_write():
    print("Testing audio write...")
    try:
        clip = ColorClip(size=(100, 100), color=(255,0,0), duration=1)
        # Create a dummy audio clip (silent)
        from moviepy.audio.AudioClip import AudioArrayClip
        import numpy as np
        # 1 second of silence
        arr = np.zeros((44100, 2))
        audio = AudioArrayClip(arr, fps=44100)
        clip = clip.set_audio(audio)
        
        print("Attempting write_audiofile with logger=None...")
        clip.audio.write_audiofile("test_audio_probe.mp3", logger=None)
        print("Success!")
    except Exception:
        traceback.print_exc()

if __name__ == "__main__":
    test_audio_write()
