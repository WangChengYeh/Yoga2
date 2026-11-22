# M2 — Pose Evaluation (v0.9.27)

M1 was accepted by the project owner on 2026-11-22 and #6 is closed. This document records the v0.9.27 evaluation contract. In v0.9.28, M2 software #7/#9 is implemented and manual/device validation moves to #11 without blocking later work; M3 shared Hint state is in progress.

## Data and boundaries

`src/pose-evaluation.js` consumes original MediaPipe landmarks, capture time, brightness, image aspect ratio and a course frame/play state. `coursePoseTarget` reads `motionAt`, the same authored movement parameters used by Luna. There is no Three.js, avatar render, LLM or TTS dependency. Inputs remain labelled anatomical left/right whether the image is mirrored. Avatar display mirroring does not change the course target.

All angles are **frontal image-plane** observations. X coordinates are scaled by the camera aspect ratio before angle calculations. World-space MediaPipe estimates are reserved for avatar retargeting, not silently mixed into 2D comparison. A single front view cannot validate 3D anatomical angles, depth, inward/outward rotation, forward knee bending, or the depth of chest opening. No safety/correctness verdict is issued.

The current conservative framing gate requires one person, visible/present major joints including feet, enough light, front orientation, a useful image size and no required joint near the frame edge. Unknown, low-confidence, cropped, multiple-person, degenerate, future or >1.5-second-old inputs produce **no correction**. Partial upper-body display in Debug remains available; it does not make a partial body valid for evaluation.

## Targets and output

Evaluation runs only in course hold windows: reach 6–10 s, side 8–12 s / 20–24 s, open 6–14 s (times within each exercise). Paused/complete/transition states have no corrections. Measurements include both arm elevations relative to torso, elbows, knees, arm elevation asymmetry and anatomical torso lean. Knee angles are diagnostic only in this increment.

| Comparison | Enter error | Exit error | Target |
| --- | --- | --- | --- |
| Upper arm elevation | >25° | ≤18° | Authored course arm angle |
| Elbow bend | >35° | ≤25° | 180° in image plane |
| Left/right arm elevation difference | >25° | ≤18° | 0° |
| Torso direction/lean | >12° | ≤8° | Authored course lean (0° or ±16°) |

These are prototype tolerances, not validated coaching or clinical thresholds. Per-joint world accuracy and tolerance calibration still need real capture evidence.

Output schema 1 includes `source`, `inputMirrored`, `status`, `capturedAt`, `evaluatedAt`, `expiresAt`, `confidence`, `target`, `metrics`, and `hints`. Each hint has code, anatomical joint, severity, confidence, measured value, target, error, active tolerance, TTL, expiry and short text. TTL is bounded by **capture time +1500 ms**, not processing completion. Minimum required-joint visibility/presence supplies confidence; it is not a calibrated probability of correctness.

Three distinct agreeing samples spanning at least 450 ms confirm the full set of hints. Confirmed hints use a narrower exit threshold to avoid threshold flicker. A changed candidate immediately clears old text/hints while stabilizing. Unknown data, duplicate/out-of-order captures, >1200 ms sample gaps, backward clocks or course window/play state changes reset confirmation. The panel also discards results from an old capture context. Corrected observations clear the previous correction and become matched after confirmation. No stale correction or praise is retained while waiting.

## App integration and diagnostics

`pose-panel.js` owns the engine and capture-relative expiry timer. The existing camera feedback card presents the first confirmed hint or an explicitly limited image-plane observation; no extra fullscreen panel is added. Camera off/stale/background, target changes and expiry clear structured state. The text-only coach still receives the current observation/stable code and message through the existing sensor context. A new `evaluation.cpu` task measures synchronous engine computation; report diagnostics include the current structured evaluation. No Hint Manager or speech scheduling changes are part of this increment.

`student-retarget.js` caches neutral model-space bone orientations/directions after setup, solves each swing from that reference, and converts to parent-relative quaternion before interpolation. This prevents accumulated axial twist from incremental orientation solves. Unobserved twist stays on the neutral reference rather than being inferred from a single direction. Prefix-compatible bone lookup is cached; diagnostics report missing mappings. Positions, scales and stage root remain locked. This does **not** implement full twist reconstruction or root locomotion.

## Acceptance and remaining work

Automated evidence uses synthetic source landmarks with known course targets and controlled deviations, not simulated device acceptance. Tests cover three exercises/four holds, mirrors, aspect ratios, elbow/elevation/asymmetry/side errors, confidence gates, correction clearing, hysteresis, staleness/duplicates, panel lifecycle and repeated retarget cycles. Existing voice/course tests remain required.

Still open:

- #11: real three-motion captures, false-positive review, threshold adjustment and iPhone Safari practice acceptance; non-blocking.
- #7 software is implemented in v0.9.28: see [retargeting](RETARGETING.md). Real motion quality continues under #11.
- #11: before/after device baselines and sustained practice. Owner M1 acceptance is not a new performance measurement.
- M3 shared Hint state is implemented in v0.9.28; full display lifecycle and separate LLM/TTS routing continue under #5/#4.
