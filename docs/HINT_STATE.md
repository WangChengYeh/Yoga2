# Shared Hint state — M3 first increment (v0.9.28)

`HintManager` is a bounded, synchronous state model shared by display and the future speech router. It has no dependency on rendering, MediaPipe, LLM or TTS execution. `pose-panel.js` sends the latest confirmed evaluation; the existing camera feedback card consumes the selected message. Equal text is not rewritten on each frame.

Hints carry id/code, source, scope, timestamp, expiry, priority, message, kind and separate numeric values. Evaluation hints keep capture-relative expiry. Unknown/stabilizing states replace old corrections immediately. Current torso correction outranks elbow, then arm elevation/symmetry; matching observations and informational transitions have lower priorities. Equal-priority surviving primary hints keep their identity while their measured values update. Supplementary LLM advice cannot outrank pose correction.

There is no event queue: at most 16 entries by default (hard maximum 32), one current display state, and latest evaluation replaces its old hint set. Expired hints are pruned. Scope changes and semantic evaluation changes increment a generation and clear old supplemental advice. A delayed publisher must provide the matching `{scope,generation}` token; old tokens are rejected even when a course later returns to the same phase.

Diagnostics count displayed/replaced/expired/suppressed hints and numeric updates, and expose bounded-state size and current identity without logging advice text. `speechCandidate` exposes the same state/context for #4; speech cadence/deduplication and LLM/TTS routing are not changed in this increment.

Remaining #5 work: full practice-screen display, independent display cadence/latency instrumentation and visual value rendering. #4 continues speech routing. Human/device tests stay in #11 and do not block these tasks.
