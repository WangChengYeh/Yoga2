# Real half-body portrait regression

`half-body-portrait.jpg` is the user-provided portrait, included at the user's explicit request for GitHub testing. It is a test asset, not a stock-photo license grant.

The test runs the repository's exact SHA-256-verified Selfie Multiclass and Pose Landmarker Lite model files, then feeds their real outputs into the production JavaScript cutout, AI skeleton and layout functions.

## Reproduce

Use Python 3.12 in a virtual environment, Node.js 22+, and Linux CPU libraries `libegl1` / `libgles2` where needed:

```sh
npm ci
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r tests/requirements-portrait.txt
npm run test:portrait
```

The native adapter uses MediaPipe Python 0.10.21; the website uses Tasks Vision 0.10.32. Model weights are identical and verified. This checks the models and production JS integration, and does not substitute for WebAssembly/Safari rendering, live camera or performance testing.

Generated confidence masks, frame bytes and landmarks go to ignored `test-results/portrait/` and are regenerated on every run. The photo is not modified.

## Observed result

- Input: 1080 × 1440; model frame: 384 × 512, matching the web frame budget.
- Labels: background, hair, body-skin, face-skin, clothes, others; production JS combines the actual person classes and cleans disconnected regions.
- Foreground area: approximately 51.2% of the frame; this is an area measurement, not an accuracy score.
- One pose detected. Nose and both shoulders are visible; the shoulder midpoint is derived from those shoulders.
- Three valid upper-body links: nose → shoulder midpoint, left shoulder → midpoint, right shoulder → midpoint.
- Hips, legs and feet are outside the photo or have insufficient confidence, so they must not be drawn.

Five integration checks cover source/output matching, face/clothing versus tree-background alpha, half-body entry without feet, AI bone visibility, and separated coach/person framing in portrait and landscape.

## Chair cleanup replay

`semantic-chair-mask.json` contains only recorded semantic probabilities (64×64, 8-bit run-length encoding) from the reported chair case. No RGB photo pixels are included. Unit tests replay foreground-class selection, connected-person filtering and preservation of the facial calibration reference. This recorded replay is separate from the real-model JPEG integration test above.
