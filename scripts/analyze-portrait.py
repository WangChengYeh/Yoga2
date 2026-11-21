"""Run the real pinned pose and selfie models on the repository portrait.

Only model outputs are generated; the original JPEG is never modified.
The native CPU adapter validates weights/integration, not browser rendering.
"""
import argparse
import hashlib
import json
from pathlib import Path
import time

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import vision

parser = argparse.ArgumentParser()
parser.add_argument('--image', required=True)
parser.add_argument('--output', required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
source = Path(args.image)
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
models = {
    'selfie_segmenter.tflite': '191ac9529ae506ee0beefa6b2c945a172dab9d07d1e802a290a4e4038226658b',
    'pose_landmarker_lite.task': '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a',
}
for name, expected in models.items():
    data = (root / 'public/models' / name).read_bytes()
    if hashlib.sha256(data).hexdigest() != expected:
        raise ValueError(f'Model checksum mismatch: {name}')
original = mp.Image.create_from_file(str(source))
scale = min(1, 512 / max(original.width, original.height))
width, height = max(1, round(original.width * scale)), max(1, round(original.height * scale))
# Match the browser's frame budget and preserve orientation/aspect.
rgb = cv2.resize(original.numpy_view(), (width, height), interpolation=cv2.INTER_LINEAR)
image = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))
base = lambda name: mp.tasks.BaseOptions(model_asset_path=str(root / 'public/models' / name))
started = time.perf_counter()
with vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(
    base_options=base('selfie_segmenter.tflite'), running_mode=vision.RunningMode.VIDEO,
    output_confidence_masks=True, output_category_mask=False,
)) as segmenter:
    labels = segmenter.labels
    foreground = next((i for i, label in enumerate(labels) if label.lower() in ('selfie', 'person')), None)
    if foreground is None:
        raise ValueError(f'Unknown foreground labels: {labels}')
    result = segmenter.segment_for_video(image, 0)
    mask = result.confidence_masks[foreground].numpy_view().copy()
with vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(
    base_options=base('pose_landmarker_lite.task'), running_mode=vision.RunningMode.VIDEO,
    num_poses=2, min_pose_detection_confidence=.6,
    min_pose_presence_confidence=.6, min_tracking_confidence=.6,
)) as detector:
    result = detector.detect_for_video(image, 0)
    poses = [[{k: float(getattr(point, k)) for k in ('x', 'y', 'z', 'visibility', 'presence')}
              for point in pose] for pose in result.pose_landmarks]
rgba = np.concatenate((rgb, np.full((height, width, 1), 255, dtype=np.uint8)), axis=2)
rgba.tofile(out / 'frame.rgba')
mask.astype('<f4').tofile(out / 'confidence.f32')
metadata = {
    'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'runtime': f'mediapipe-python-{mp.__version__}',
    'models': models, 'width': width, 'height': height,
    'maskWidth': int(mask.shape[1]), 'maskHeight': int(mask.shape[0]),
    'labels': labels, 'foregroundIndex': foreground,
    'landmarks': poses,
    'metrics': {'foregroundFraction': float(np.mean(mask > .5)),
                'elapsedSeconds': time.perf_counter() - started},
}
(out / 'result.json').write_text(json.dumps(metadata, indent=2) + '\n')
print(json.dumps({'frame': [width, height], 'poses': len(poses), 'foregroundFraction': metadata['metrics']['foregroundFraction']}))
