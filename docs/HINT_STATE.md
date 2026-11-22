# Shared Hint state — M3 software implemented (v0.9.29)

`HintManager` is a bounded, synchronous state model shared by display and the speech router. It has no dependency on rendering, MediaPipe, LLM or TTS execution. `pose-panel.js` sends the latest confirmed evaluation; the camera feedback card and practice-screen display consume the selected message. Equal text is not rewritten on each frame.

Hints carry id/code, source, scope, timestamp, expiry, priority, message, kind and separate numeric values. Evaluation hints keep capture-relative expiry. Unknown/stabilizing states replace old corrections immediately. Current torso correction outranks elbow, then arm elevation/symmetry; matching observations and informational transitions have lower priorities. Equal-priority surviving primary hints keep their identity while their measured values update. Supplementary LLM advice cannot outrank pose correction.

There is no event queue: at most 16 entries by default (hard maximum 32), one current display state, and latest evaluation replaces its old hint set. Expired hints are pruned. Scope changes and semantic evaluation changes increment a generation and clear old supplemental advice. A delayed publisher must provide the matching `{scope,generation}` token; old tokens are rejected even when a course later returns to the same phase.

Diagnostics count displayed/replaced/expired/suppressed hints and numeric updates, and expose bounded-state size and current identity without logging advice text. Matching-code LLM supplements remain subordinate to the deterministic correction.

`hint-display.js` renders a dedicated practice-screen Hint and separate values on an independent 250 ms timer plus immediate semantic refresh. It includes course, pause, camera-off/setup/error and completion states. Background suspension stops its timer. Diagnostics distinguish text/value writes, refresh latency and capture-to-display latency.

`hint-speech.js` owns speech cadence independently. Course cues remain fixed local phrases, and each confirmed correction is deduplicated by semantic identity before local TTS. Default minimum interval is 15 seconds. A persistent correction needs at least three distinct observations across three seconds before optional LLM explanation, after its local reminder. Default LLM cooldown is 20 seconds across changes. Settings persist locally. One bounded aggregate, one cancellable request and at most one pending explanation replace queues. Pausing, correction clearance, stale observations, scope/generation changes and user speech discard old work; the user question lane preempts guidance. Late replies must still match current scope, generation, code and TTL, and pass a brief-text validator. `local-ai.js` uses a cancellable guidance lane for explanation and preserves the normal question path.

Diagnostics distinguish generated/merged/dropped, LLM triggered/skipped, TTS submitted/actually started/dropped and latency. A submission is not counted as playback until the speech service acknowledges start. Tests cover interruption, stale AI completion, expired pending speech and cancellation locks.

#4/#5 software work is implemented. Human/device correction precision, real speech-service timing and sustained practice remain in #11 and do not block later milestones.
