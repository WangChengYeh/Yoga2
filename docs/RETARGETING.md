# Student retarget and calibration — v0.9.28

M2 software is implemented. Human/device quality checks are recorded in #11 and **do not block later development or releases**. These transforms estimate a display pose, not physical joint accuracy. Evaluation still consumes original source landmarks.

## Asset contract

`humanoid-rig.js` defines Yoga2-Humanoid-1, a 22-bone GLB/glTF skinned humanoid:

| Chain | Canonical names |
| --- | --- |
| Torso | Hips → Spine → Spine1 → Spine2 → Neck → Head |
| Left arm | Spine2 → LeftShoulder → LeftArm → LeftForeArm → LeftHand |
| Right arm | Spine2 → RightShoulder → RightArm → RightForeArm → RightHand |
| Left leg | Hips → LeftUpLeg → LeftLeg → LeftFoot → LeftToeBase |
| Right leg | Hips → RightUpLeg → RightLeg → RightFoot → RightToeBase |

Exact names, unique suffix/prefix names, or an explicit `boneMap` from canonical name to actual name/bone are supported. Extra helper bones between chain members are allowed. Ambiguous/duplicate mappings, missing bones, broken ancestor relationships, missing skinIndex/skinWeight/skeleton, bones absent from mesh skeletons, or non-finite/non-positive bone transforms fail asset validation. The student panel releases the rejected asset and falls back to the original default male Avatar. Arbitrary explicitly mapped names work through standing setup, retarget and skeleton display. Appearance meshes can change while keeping this contract; generating a personalized mesh remains M5.

The original default asset is CC0, rigidly skinned segments; this change does not fabricate new mesh weights. Model standing setup normalizes scale/forward using authored transforms. Bone positions/scales and stage root translation remain fixed. Source limb lengths affect directions, not avatar body proportions.

## Source mapping

MediaPipe anatomical labels remain separate from bones. Default mirror mode swaps labelled sides **and** reflects X, including face, fingers, heels and toes. Reliable world XYZ is transformed to model-facing coordinates (Y up, Z forward). If no world result exists, image-aspect-corrected planar upper/lower limb directions and torso lean remain available. A malformed world point is not silently replaced by a 2D point.

- Upper/lower arms: shoulders → elbows → wrists (11–16).
- Upper/lower legs: hips → knees → ankles (23–28).
- Pelvis frame: hip lateral axis and hip-to-knee-center up reference.
- Three spine orientations: pelvis-to-shoulder frame interpolation at 1/3, 2/3, 1. Neck/head use reliable nose/ear references (0/7/8) blended from the torso.
- Upper arm twist: sufficiently non-collinear upper/lower arm plane. Forearm/hand orientation: wrist, pinky and index (15–20).
- Foot direction/secondary axis: heel, toe and ankle (27–32).

Every participating point must pass image visibility/presence/in-frame checks; world components must be finite. Degenerate baselines/collinear reference planes are ignored. No head, palm, foot or pelvis depth is fabricated from 2D fallback. Missing targets hold briefly (300 ms), then blend toward local neutral. Whole observations expire after 1500 ms. Dark/multiple-person/duplicate/future/stale observations are rejected.

## Calibration

The optional **校正站姿** button lives in the student card and moves into fullscreen ⋯. Camera off disables it. Clicking invalidates in-flight student observations through the human session token, clears previous targets, and collects a stable upright world reference:

- Five distinct observations spanning ≥600 ms.
- Reliable hips/shoulders, torso close to upright (up dot vertical ≥.94), hip vertical variation ≤.2 of the normalized lateral axis, non-degenerate shoulders.
- Yaw variation ≤.14 rad and gaps ≤800 ms; unstable samples restart the collection window.
- Circular-mean yaw becomes the source-facing correction. Root translation/scale remain unchanged.
- A 10-second timeout or unavailable world references does not pause practice. Existing calibrated yaw is retained during retry/failure. Reset/camera session change clears calibration.

This is a source-facing reference, not a medical/postural calibration or camera extrinsic reconstruction.

## Solver and constraints

Each bone keeps a neutral model-space direction, secondary axis and orientation. Fresh direction targets solve swing from that immutable reference. Observable reference planes add signed twist limited to ±60°; equivalent plane signs choose the nearest reference orientation. Missing twist stays at the neutral swing reference. Full body frames are applied relative to the cached torso frame, converted through the current parent's world inverse, then smoothed.

Local rotations relative to neutral are bounded for visual robustness: hips .9 rad, spine 1.2 rad, neck/head .85 rad, hands/feet 1.4 rad, other limbs π rad. Angular movement is capped at 8 rad/s before interpolation. These are display limits, **not validated anatomical joint ranges**. Twist is ambiguous from one segment; the implementation does not claim full anatomical reconstruction.

Diagnostics expose rig compatibility/reasons, observed/missing mappings, coordinate space, calibration state, accepted/rejected captures, constraint activations, tracking and source timestamps. Existing retarget.cpu timing and report snapshots continue to measure the path. Tests cover repeated poses, prefix/explicit alias rigs, rotated/scaled/transformed source, calibration/timeout/retry, missing joints, body turn/bent knees/single-leg inputs and resource fallback. Real capture precision and sustained performance remain unverified in #11.
