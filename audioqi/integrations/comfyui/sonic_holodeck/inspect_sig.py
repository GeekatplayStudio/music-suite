import sys
import os
import inspect

# Add HeartMuLa path
# __file__ is D:\ComfyUI\0.10\ComfyUI\custom_nodes\Sonic-Holodeck\inspect_sig.py
current_dir = os.path.dirname(os.path.abspath(__file__))
custom_nodes_path = os.path.dirname(current_dir)
heartmula_path = os.path.join(custom_nodes_path, "ComfyUI_FL-HeartMuLa")
sys.path.insert(0, heartmula_path)

print(f"Added path: {heartmula_path}")

try:
    from heartlib.pipelines.music_generation import HeartMuLaGenPipeline
    sig = inspect.signature(HeartMuLaGenPipeline.from_pretrained)
    print("Signature:", sig)
except Exception as e:
    print(f"Error: {e}")
