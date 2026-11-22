# Yoga2 — Product Goal & Milestone Roadmap

Updated: 2026-11-22. Status: M1 accepted by project owner on 2026-11-22 (v0.9.26), #6 closed. M2 software implemented (v0.9.28); M3 software implemented (v0.9.29). Manual/device validation is non-blocking and tracked by #11. M4 software implemented (v0.9.30); M5 first software release implemented (v0.9.31).

## Product Goal
Yoga2 is a **mobile-browser Personal AI Yoga Coach**: Luna demonstrates a target yoga pose, the user's camera provides MediaPipe pose observations, a male student Avatar visualizes the user's motion, deterministic evaluation compares the observations to the course target, and timely visual/voice feedback helps the user correct the pose. Prioritize an effective **observe → evaluate → correct** loop over photorealism.

### Principles
1. Local-first mobile browser; preserve a useful basic practice flow when WebLLM, microphone or personalization fails.
2. Pose evaluation uses source landmarks and confidence, **not rendered Avatar pixels**. MediaPipe landmarks are not a 1:1 Humanoid bone map.
3. Keep rendering, retargeting, pose evaluation, Hint display and LLM/TTS separate. The display Hint must not wait for LLM.
4. Default male Avatar uses a shared Humanoid Rig. Personalized face/appearance must not change the bone mapping contract.
5. Profile and measure on iPhone 13 Safari and MacBook; task loading and GPU completion notifications are estimates, **not hardware GPU utilization**.
6. All phases have explicit acceptance criteria; untested items remain unverified.

## Milestones (dependency order; manual validation does not block later work)

| Milestone | Scope | GitHub Issues | Exit criteria |
| --- | --- | --- | --- |
| M1 — Dual Avatar MVP (accepted) | Luna left, default male Avatar right; camera→MediaPipe→minimal retarget; remove unneeded segmentation after dependency audit | [#6](https://github.com/WangChengYeh/Yoga2/issues/6), subset of [#7](https://github.com/WangChengYeh/Yoga2/issues/7) | All three existing yoga motions follow user sufficiently for MVP; baseline performance measured |
| M2 — Pose Accuracy (software implemented) | Complete Humanoid retargeting and independent Pose Evaluation Engine | [#7](https://github.com/WangChengYeh/Yoga2/issues/7), [#9](https://github.com/WangChengYeh/Yoga2/issues/9) | Deterministic, confidence-aware correction signals for three exercises; unknown/occluded poses not treated as errors |
| M3 — Coaching Feedback (software implemented) | Shared Hint manager, instant visual feedback, then speech/LLM routing | [#5](https://github.com/WangChengYeh/Yoga2/issues/5), [#4](https://github.com/WangChengYeh/Yoga2/issues/4) | Wrong pose→visible Hint→correction clears; speech deduplicated, nonblocking, stale responses discarded |
| M4 — Performance & Reliability (software implemented; device validation open) | CPU/GPU factor, latest-wins scheduling, benchmarks and sustained mobile validation | [#10](https://github.com/WangChengYeh/Yoga2/issues/10), [#11](https://github.com/WangChengYeh/Yoga2/issues/11) | iPhone 13 30-minute practice without crash or serious stalls; measured baselines and fallback behavior documented |
| M5 — Personalized Avatar (first software release) | Free, phone-side JS photo personalization, shared Humanoid Rig, IndexedDB | [#8](https://github.com/WangChengYeh/Yoga2/issues/8) | Preview, local storage/delete, reliable rig integration, default Avatar fallback; library/license and Safari PoC verified |

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
Per owner direction on 2026-11-22, software implementation and human/device validation are tracked separately. Passing source checks, automated regressions, build and available browser QA allow release and development of the next milestone. Move manual captures, iPhone Safari, before/after device measurements and sustained-practice validation into #11; keep them explicitly unverified until evidence is supplied. They do not block implementation, release, or later milestones. A concrete known regression or failing automated check still blocks release. Never equate automated tests with device acceptance.

## M1 implementation progress — v0.9.24
- Implemented: licensed original male skinned GLB, Luna left/student right, local-quaternion arm/leg/spine mapping, mirror side swap, interpolation, confidence/occlusion/staleness handling, fixed root/scale, optional camera debug view.
- Source observations still feed existing deterministic observation/LLM context; the displayed Avatar does not become the evaluator. No voice pipeline refactor.
- Default app no longer instantiates the cutout layer or requests segmentation. Legacy cutout modules and regression fixtures remain for historical comparison.
- Automated and offline visual checks: see [M1 evidence](DUAL_AVATAR.md). Owner accepted M1 on 2026-11-22 after v0.9.26, and #6 is closed. This records owner acceptance; no new iPhone capture, benchmark or sustained-practice measurement is being claimed. Remaining device/performance evidence continues under #11.

## M1 follow-up — v0.9.26
- Debug camera/skeleton occupies a separate right rail (landscape) or bottom strip (portrait), with reserved toolbar/playback space. Both avatars reframe through the existing viewport ResizeObserver.
- Closing camera or disabling Debug restores the full viewport. Video and skeleton preserve the same letterboxing.
- Browser layout checks cover debug on/off, hidden camera, fullscreen/embedded, orientation and camera aspect ratios. These do not constitute new device or performance measurements.

## M2 first implementation — v0.9.27
- Independent deterministic Pose Evaluation Engine compares original MediaPipe observations with the same course motion parameters used by Luna. Three exercises, four hold windows, image-aspect-corrected arm elevation/elbow/knee metrics, arm symmetry and anatomical torso direction. No rendered-avatar input.
- Structured hints include code, joint, severity, confidence, measurement/target/error, expiry and TTL. Three distinct samples over at least 450 ms, enter/exit hysteresis, immediate unknown/phase reset, and a 1.5-second expiry. Existing camera feedback presents the first confirmed hint; Hint Manager/LLM/TTS refactors remain M3.
- Student retarget uses cached neutral model-space orientations and parent-relative local quaternions; repeated motion does not accumulate swing-derived twist. Prefixed names/model yaw and missing-bone diagnostics are covered.
- This v0.9.27 entry records the initial scope. v0.9.28 completes the remaining M2 software work below; real capture/device validation is tracked separately in #11. Single-camera frontal 2D angles do not establish physical 3D accuracy or chest depth.
- See [M2 evaluation contract and remaining work](POSE_EVALUATION.md).

## M2 software completion and M3 start — v0.9.28
- M2: explicit 22-bone rig contract/mapping, hierarchy/skinning validation and default-Avatar fallback; repeatable five-sample world-landmark yaw calibration with timeout/fallback; pelvis/spine/neck/head/palm/foot reference planes, bounded twist/local rotation, angular-rate limit and confidence/degeneracy gates. Root translation and bone scales stay fixed.
- #7 and #9 software scopes are implemented; their human/device checks continue under #11 without holding later development. Retarget is an estimate and no physical 3D accuracy claim is made.
- M3 started: bounded shared Hint state, correction priority, stable text with independent values, TTL, scope/generation rejection for delayed suggestions, diagnostics and a speech-candidate interface. Existing camera feedback consumes it; full practice-screen presentation and speech cadence/LLM/TTS routing (#5/#4) continue next.
- Contracts and limits: [retargeting](RETARGETING.md), [evaluation](POSE_EVALUATION.md), [shared Hint state](HINT_STATE.md).

## M3 software completion — v0.9.29
- #5: dedicated practice-screen Hint, independent 4 Hz refresh, stable text/separate numeric values, unknown/camera/error/pause states, capture-to-display and refresh latency diagnostics. Display does not wait for LLM/TTS.
- #4: deterministic course cues and confirmed corrections use local TTS; persistent deviations aggregate distinct samples before one optional LLM explanation. Configurable minimum interval/cooldown, no request backlog, user-question priority, semantic generation/TTL rejection and played-vs-submitted diagnostics.
- Current Avatar skin envelopes automatically fit the camera to both actors and visible UI boundaries. Expansion is immediate, contraction is smooth; the default auto-frame toggle can be disabled for manual zoom. This supersedes fixed framing as the runtime default; historical fixed-layout tests remain fallback coverage.
- Automated/source/build and available browser checks are software evidence only. Device latency, correction precision, speech service behavior, GPU appearance and sustained practice remain unverified in #11. M4 is the next milestone.

## M4 software implementation — v0.9.30
- #10: independent CPU/GPU factors with manual ceilings, bounded adaptation and anti-oscillation. Render/retarget/framing, framebuffer pixels, camera/Pose/evaluation, repeated Hint values and optional LLM explanations follow explicit budgets. Course clock, commands and immediate invalid/semantic state remain authoritative.
- Scheduler keys/TTL implement queued latest-wins and expiry; automatic explanation is below vision priority. Expired camera jobs retry with a fresh frame; active native inference never releases its lane before completion/termination acknowledgement.
- Live factor diagnostics and baselines, GPU pending age, automated overload/recovery and a reproducible synthetic 30-minute replay are implemented. See [policy and evidence](PERFORMANCE.md).
- #10 software scope is complete. #11 stays open for actual iPhone/MacBook baselines, heat/memory, latency/precision and 30-minute stability. Synthetic tests are not device acceptance and do not close #11. Per owner direction these checks do not block M5 personalization, the next milestone.

## M5 first software release — v0.9.31
- #8: one-photo, local JS, manual alignment and bounded parametric head/appearance on the unchanged 22-bone male Humanoid. Photo-textured head skin follows the existing Head bone; default-body retarget remains independent.
- Consent, derived-crop preview, session-only apply, explicit IndexedDB save/restore/edit/delete, default fallback and rigged/textured GLB export are implemented. Original files/EXIF are not stored or automatically transmitted. Practice does not regenerate appearance.
- This release selects manual face-texture/parametric-head personalization, not automatic Face Landmark/Blendshape or photorealistic full-head reconstruction. Candidate library/model license and automatic fitting remain optional research; they are not represented as integrated.
- Functional browser persistence/export and static resource evidence are in [PERSONAL_AVATAR.md](PERSONAL_AVATAR.md). Real iPhone Safari, GPU appearance, similarity/side-view quality and sustained device benchmarks remain non-blocking in #11. M1–M5 now have software releases; device quality work continues in #11.

## M5 workflow revision — v0.9.32
- Owner changed new-avatar input to three full-body views: front, side and back. All three are required before generation. Full-body crop assistance, reference-arm alignment and side mirroring replace the one-photo editor; schema 1 saved profiles remain readable.
- Three-view textures are baked onto the bundled CC0 Luna humanoid template, retaining skin weights and the existing rig/retarget/framing contracts. Preview, cancellation, session-only application, explicit save/restore/edit/delete and rigged GLB export are implemented. No photogrammetry, automatic body-shape reconstruction or cloud-photo service is claimed.
- Actual private photos were tested through generation, persistence, export and offline CPU renders. Visible seams/proportion differences remain quality follow-up under #11/#18. Neither private photos nor generated models are committed. Device/human checks do not block subsequent development.
