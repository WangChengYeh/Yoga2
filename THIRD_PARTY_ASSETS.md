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

## Selfie Multiclass 256×256 (v0.7.1)

- Official Google MediaPipe semantic person segmentation model, float32, version 1: `https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite`.
- 16,371,837 bytes; SHA-256: `c6748b1253a99067ef71f7e26ca71096cd449baefa8f101900ea23016507e0e0`.
- Labels: background, hair, body-skin, face-skin, clothes, others. Yoga2 retains person classes, restricts accessories and cleans detached regions. Facial skin supplies a fixed anatomical calibration reference.
- [Official task documentation](https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter/index); Google MediaPipe, Apache-2.0.
- Downloaded and checksum-verified during builds; excluded from Git. Pages loads the pinned Google model after the camera is enabled; the self-contained build includes it.
- RGB/masks stay in browser memory. This replaces the small binary Selfie Segmenter used in v0.6.1–v0.7.0; higher quality comes with a larger download and inference cost.

## html2canvas (M8)

- html2canvas 1.4.1, MIT license, pinned npm dependency. [Source](https://github.com/niklasvh/html2canvas).
- Used locally in the browser to rasterize the practice stage and controls; no images are sent to this library's provider. Pages loads the pinned JavaScript from jsDelivr; the build bundles it. Only an explicit diagnostic report uploads captured images to GitHub.

## Optional local dialogue AI (v0.9.0)

- WebLLM 0.2.89 (Apache-2.0), loaded on explicit opt-in from https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.89/+esm ; source/license: https://github.com/mlc-ai/web-llm .
- Qwen2.5-0.5B-Instruct 4-bit MLC weights, from https://huggingface.co/mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC (or q4f32_1 fallback). Model license: Apache-2.0; upstream: https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct . Model libraries and weights are downloaded by WebLLM after opt-in.
