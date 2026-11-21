# Third-party assets

## Luna character (derived from Grab3D)

- Source: [Woman Base Mesh](https://grab3d.com/models/characters/woman-base-character/), Grab3D, CC0-1.0.
- [Rigged original GLB](https://grab3d.com/dl/woman-base-character-rigged/woman-base-character-rigged.glb); source license and AI-assisted creation disclosure preserved in `public/models/LUNA-LICENSE.txt`.
- Origin: AI-assisted base and textures, cleaned and rigged by Grab3D; adapted for Yoga2.
- Bundled derivative: `public/models/luna-v1.glb`, 1,963,528 bytes, 36,000 triangles, base color textures up to 1024px, other textures up to 512px.
- Modifications: mesh simplification, canonical joint names, consolidated head weights, jawOpen morph, resized textures, reduced metallic glare, removed unused animation.
- Source/output SHA-256 and reproducible Blender command: `public/models/luna-source.json`; build recipe: `scripts/build-coach.py`.
- Both GitHub Pages and self-contained builds serve the derivative from this site. The former temporary Michelle asset is no longer loaded or distributed by this version.
- Yoga2 procedural movements have not been reviewed as professional yoga instruction.

## Three.js

- Version: 0.180.0, MIT license, copyright Three.js authors.
- The build includes the upstream license at `dist/vendor/THREE-LICENSE.txt`.
- The `dist/` build serves browser modules from the same origin. The root GitHub Pages entry uses the same version pinned on jsDelivr, and loads the bundled Luna character from this site.

## MediaPipe Tasks Vision and Pose Landmarker Lite

- SDK: `@mediapipe/tasks-vision` 0.10.32, Apache-2.0; [upstream](https://github.com/google-ai-edge/mediapipe).
- [Official Pose Landmarker documentation](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js).
- Model: Google Pose Landmarker Lite, float16, version 1, downloaded from `storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`.
- SHA-256: `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a`.
- The model is excluded from Git and verified when building. GitHub Pages downloads fixed-version SDK/WASM and model resources only when the user enables observation; the self-contained build includes them locally. Camera images are not uploaded to these providers.

## Selfie Segmenter (v0.6.1)

- Official Google MediaPipe person segmentation model, float16, version 1: `https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite`.
- 249,537 bytes; SHA-256: `191ac9529ae506ee0beefa6b2c945a172dab9d07d1e802a290a4e4038226658b`.
- Pinned model metadata labels: `selfie` (foreground channel 0). The adapter reads labels rather than assuming the background/person ordering of other models.
- [Official task documentation](https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter/index); Google MediaPipe, Apache-2.0.
- Downloaded and checksum-verified during builds; excluded from Git. Pages loads the fixed-version Google asset only with the camera active; the self-contained build includes the verified model.
- Portrait segmentation is independent of pose landmark availability. Mask confidence and captured RGB remain in browser memory; results close after copying, and the task closes with the camera.
