# Yoga2 — Product Goal & Milestone Roadmap

Updated: 2026-11-22. Status: M1 implementation delivered in v0.9.24; device and performance exit gates pending. Later milestones remain planned.

## Product Goal
Yoga2 is a **mobile-browser Personal AI Yoga Coach**: Luna demonstrates a target yoga pose, the user's camera provides MediaPipe pose observations, a male student Avatar visualizes the user's motion, deterministic evaluation compares the observations to the course target, and timely visual/voice feedback helps the user correct the pose. Prioritize an effective **observe → evaluate → correct** loop over photorealism.

### Principles
1. Local-first mobile browser; preserve a useful basic practice flow when WebLLM, microphone or personalization fails.
2. Pose evaluation uses source landmarks and confidence, **not rendered Avatar pixels**. MediaPipe landmarks are not a 1:1 Humanoid bone map.
3. Keep rendering, retargeting, pose evaluation, Hint display and LLM/TTS separate. The display Hint must not wait for LLM.
4. Default male Avatar uses a shared Humanoid Rig. Personalized face/appearance must not change the bone mapping contract.
5. Profile and measure on iPhone 13 Safari and MacBook; task loading and GPU completion notifications are estimates, **not hardware GPU utilization**.
6. All phases have explicit acceptance criteria; untested items remain unverified.

## Proposed Milestones (sequential, no dates committed)

| Milestone | Scope | GitHub Issues | Exit criteria |
| --- | --- | --- | --- |
| M1 — Dual Avatar MVP | Luna left, default male Avatar right; camera→MediaPipe→minimal retarget; remove unneeded segmentation after dependency audit | [#6](https://github.com/WangChengYeh/Yoga2/issues/6), subset of [#7](https://github.com/WangChengYeh/Yoga2/issues/7) | All three existing yoga motions follow user sufficiently for MVP; baseline performance measured |
| M2 — Pose Accuracy | Complete Humanoid retargeting and independent Pose Evaluation Engine | [#7](https://github.com/WangChengYeh/Yoga2/issues/7), [#9](https://github.com/WangChengYeh/Yoga2/issues/9) | Deterministic, confidence-aware correction signals for three exercises; unknown/occluded poses not treated as errors |
| M3 — Coaching Feedback | Shared Hint manager, instant visual feedback, then speech/LLM routing | [#5](https://github.com/WangChengYeh/Yoga2/issues/5), [#4](https://github.com/WangChengYeh/Yoga2/issues/4) | Wrong pose→visible Hint→correction clears; speech deduplicated, nonblocking, stale responses discarded |
| M4 — Performance & Reliability | CPU/GPU factor, latest-wins scheduling, benchmarks and sustained mobile validation | [#10](https://github.com/WangChengYeh/Yoga2/issues/10), [#11](https://github.com/WangChengYeh/Yoga2/issues/11) | iPhone 13 30-minute practice without crash or serious stalls; measured baselines and fallback behavior documented |
| M5 — Personalized Avatar | Free, phone-side JS photo personalization, shared Humanoid Rig, IndexedDB | [#8](https://github.com/WangChengYeh/Yoga2/issues/8) | Preview, local storage/delete, reliable rig integration, default Avatar fallback; library/license and Safari PoC verified |

## Task boundaries
- **#6** delivers minimal retarget for visible motion; **#7** hardens calibration, bind pose, local quaternion, twist, pelvis/spine, confidence and rig compatibility. Do not block #6 on all of #7.
- **#9** evaluates poses; **#5** decides what to show; **#4** decides whether/how to speak. WebLLM should explain, not compute every real-time joint error.
- **#10** controls workload (CPU/GPU factor) and drops stale *nonessential* work; course clock, user commands and safety-relevant state remain authoritative.
- **#11** measures each phase; its tests start in M1 and continue through all milestones, even though final reliability sign-off is M4.
- **#8** is optional personalization and must not block teaching value. Candidate face-to-blendshape-3d and MediaPipe Face Landmarker require license, integration and iPhone Safari validation; face landmarks alone do not generate a photorealistic rigged head.

## Suggested initial performance experiments (not verified targets)
- Camera: 15–20 FPS; Pose inference: 5–10 FPS; render: 15–30 FPS.
- Retarget and pose evaluation consume only fresh valid pose observations; short interpolation may smooth rendered motion without fabricating long-lived tracking.
- LLM: event-driven; local deterministic guidance is the fallback.
- Measure camera→pose→evaluation→display latency, hint precision, frame timing, memory proxies, device heat, and GPU completion pending/latency.

## Existing repository baseline
- v0.9.23 is the historical cutout baseline. v0.9.24 implements Luna + male student Avatar with minimal confidence-aware retarget; default segmentation/RGBA/CanvasTexture is removed from the active scene path. Personalization remains planned.
- Existing README reports configurable FPS, task-performance timeline, GPU completion notification, local Qwen/WebLLM and browser TTS/STT. Actual iPhone 13 30-minute stability remains unverified in docs/IMPROVEMENT_PLAN.md.
- [3D_Yoga_Web_Plan.md](../3D_Yoga_Web_Plan.md) is marked as historical and superseded by this roadmap.

## Release gates
For each milestone: source changes + tests, representative screenshots/video, iPhone Safari check, before/after performance snapshot, regression of course and voice controls, documented limitations, and explicit pass/fail. Never equate simulated tests with device acceptance.

## M1 implementation progress — v0.9.24
- Implemented: licensed original male skinned GLB, Luna left/student right, local-quaternion arm/leg/spine mapping, mirror side swap, interpolation, confidence/occlusion/staleness handling, fixed root/scale, optional camera debug view.
- Source observations still feed existing deterministic observation/LLM context; the displayed Avatar does not become the evaluator. No voice pipeline refactor.
- Default app no longer instantiates the cutout layer or requests segmentation. Legacy cutout modules and regression fixtures remain for historical comparison.
- Automated and offline visual checks: see [M1 evidence](DUAL_AVATAR.md). Not yet accepted: iPhone Safari, real three-motion capture, before/after benchmark and sustained practice. M1 is not signed off; M2–M5 remain pending.

## M1 follow-up — v0.9.26
- Debug camera/skeleton occupies a separate right rail (landscape) or bottom strip (portrait), with reserved toolbar/playback space. Both avatars reframe through the existing viewport ResizeObserver.
- Closing camera or disabling Debug restores the full viewport. Video and skeleton preserve the same letterboxing.
- Browser layout checks cover debug on/off, hidden camera, fullscreen/embedded, orientation and camera aspect ratios. These do not replace pending device/three-motion/performance acceptance above.
