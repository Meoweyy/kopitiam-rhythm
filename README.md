# Kopitiam Rhythm

A self-administered tablet rhythm game that trains the **internal clock** in older adults by
progressively withdrawing the pacing cue, and measures beat-keeping across two effectors.

Final Year Project — Benjamin Yeoh. Randomised two-arm trial (cue-fading vs cue-present) in
community-dwelling Singaporean adults aged 60+.

**Primary outcome:** continuation consistency in Block R4 — the CV of inter-tap intervals after
the cue is withdrawn.

---

## This is a measurement instrument, not a game

Group differences in this literature are tens of milliseconds. A timing bug discovered after data
collection cannot be fixed, because the participants are gone. Three rules follow, and they are
not negotiable.

### 1. Store raw timestamps. Correct at analysis time.

The database holds **raw monotonic clock values only**. Latency correction happens in exactly one
pure function in `analysis/`, referencing a `calibration_id`. Calibration bugs are found *after*
collection; a study that baked a wrong constant into its raw data is dead, whereas one that stored
raw values plus a calibration row is re-analysed in ten minutes. This rule also makes the classic
"was the correction applied twice?" bug structurally impossible.

### 2. Scored taps never come from React Native's touch system.

`onPressIn` timestamps pass through the JS thread and pick up 5–30 ms of *load-dependent*
latency. Because it varies, it inflates measured **variability** — which is the primary outcome.
A device that janks more would look like a participant with worse rhythm.

Scored taps come from the native touch hook (`MotionEvent.getEventTime()`, stamped by the kernel
input layer, captured in `MainActivity.dispatchTouchEvent`). React's touch events drive visuals
only. There is a test asserting that a React press produces no scored row.

### 3. The measurement core is pure TypeScript.

`packages/core` compiles with `"lib": ["ES2022"]` and `"types": []`, and lists no runtime
dependencies. So `react-native`, `process`, `document` and `fetch` do not resolve inside it — a
violation is a **compile error**, not a lint someone can suppress. `purity.test.ts` guards the
ways that guarantee could be undone later.

This is what lets a synthetic 15-session participant run headless in under a second, and what
lets the statistical pipeline be tested against data with known ground truth.

---

## Layout

npm workspaces monorepo.

```
packages/core/    the measurement core — PURE TypeScript, no React, no Node, no DOM
  src/domain/       ports + protocol + blocks + session engine
  src/analysis/     cleaning, matching, metrics
app/              React Native 0.87 shell
  src/timing/       adapters implementing the core's ports (fake + native)
  src/data/         SQLite, repositories, CSV export
  src/ui/           kopitiam presenters, researcher screens
  android/          Kotlin touch hook (M8), Oboe audio (M9)
  ios/              Swift adapters (Dec 2026)
shared/dsp/       platform-neutral C++ compiled into BOTH Android and iOS, so the
                  two builds cannot drift into being different instruments
tools/            Python: loopback analysis, offline vocal onset detection
docs/             timing methods, calibration protocol, device qualification
```

The architecture in one line: `packages/core/src/domain/ports/` names what the game needs,
`app/src/timing/fake/` and `app/src/timing/native/` supply it, and one composition root picks.

---

## Running it

```bash
npm ci                                    # once, from the repo root

npm run test:core                         # measurement core, headless, ~2 s
npm run typecheck                         # both workspaces
npm run verify                            # typecheck + lint + test, everything

npm start                                 # Metro bundler
npm run android                           # onto a connected tablet
```

Note there is **no browser dev target**: React Native needs a device or emulator, so the Android
SDK is required from M3 onward. The core, however, is testable with Node alone.

---

## Reproducibility

Every session records `protocol_version`, `generator_version`, `policy_version`,
`analysis_version`, `app_version`, `schema_version` and its `session_seed`. A session's exact
stimulus sequence can be regenerated from the seed alone.

Randomness in the core is a seeded PCG32, never `Math.random()` or a platform source — that is
what makes a session reproducible, and it is why `crypto` is on the forbidden-import list.

Dependencies are pinned by the lockfile and CI installs with `npm ci`. React Native's touch
delivery is part of the measurement path, so a mid-trial dependency bump is a protocol deviation,
not a chore.

Before data collection begins, `Protocol`, the pattern generator and the analysis module are
frozen and the collecting release is tagged.

---

## Never commit

Participant data, recordings, databases, the sealed randomisation list, PIN hashes. See
`.gitignore` — and note that a private remote is still a copy on someone else's server.
