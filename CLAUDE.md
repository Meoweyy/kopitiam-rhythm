# Kopitiam Rhythm — operating context for Claude

**Read `docs/HANDOFF.md` first.** It is the full history: what was built, why, what was
found on the device, and exactly where the previous session stopped. This file is the short
version that must always be true.

## What this project is

A Final Year Project (Benjamin Yeoh, NTU, submission ~May 2027). A self-administered tablet
rhythm game that trains the internal clock in older adults (60+, Singapore) by progressively
withdrawing the pacing cue. Randomised two-arm trial: cue-fading vs cue-present.

**Primary outcome:** continuation consistency in block R4 — the CV of inter-tap intervals
after the cue is withdrawn. Effects in this literature are tens of milliseconds.

**This is a measurement instrument wearing a game costume.** A timing bug found after data
collection cannot be fixed — the participants are gone. That single fact drives every decision.

## Non-negotiable rules

1. **Store raw timestamps. Never write a corrected timestamp to the database.** Latency
   correction happens at analysis time, in one pure function, referencing a calibration row.
2. **Scored taps never come from React Native's gesture system.** They come from the kernel
   (`MotionEvent.getEventTime()`), via a native hook (M8). RN touch events drive visuals only.
   Until M8, `nativeEvent.timestamp` is used as the best available stand-in.
3. **`packages/core` is pure TypeScript.** No React, no React Native, no Node, no DOM, no
   database. This is a *compile error*, not a lint: its tsconfig has `"lib": ["ES2022"]` and
   `"types": []`, and it declares no runtime dependencies. `purity.test.ts` guards it.
4. **Time is passed in, never read.** Core classes take timestamps as arguments. That is what
   makes a ten-second run testable in microseconds and keeps the tests from ever flaking.
5. **Every constant lives in `packages/core/src/domain/protocol/protocol.ts`**, snapshot-locked.
   Changing a value fails the test until `PROTOCOL_VERSION` is bumped and the reason recorded.
6. **Randomness is seeded PCG32**, never `Math.random()` or `crypto`. Every session is
   regenerable from its seed.
7. **Rejected taps are recorded with a reason, never dropped.**
8. **Abstractions are extracted, not guessed.** The shared `Block` interface is written at M5,
   after C1 and C2 both exist. Do not design it earlier.

## Stack (decided, do not relitigate)

- React Native 0.87.1, React 19.2.3, TypeScript 6 — chosen for the user's fluency
- npm workspaces monorepo: `app/` (RN shell) + `packages/core/` (pure TS)
- Vitest for core (fast, pure Node); Jest for app (needs RN preset)
- Android first; iOS in Dec 2026 **only if a Mac is available** (unresolved)
- On-device SQLite + CSV export (M6–M7, not built yet)
- No browser dev target exists. A real Android device is required to see the app.

## Layout

```
C:\src\fyp\                    <- THE REPO. Not the OneDrive folder.
  CLAUDE.md                    <- this file
  docs/HANDOFF.md              <- full history, read it
  docs/PLAN.md                 <- 13 milestones with done-criteria
  packages/core/               <- pure measurement core
    src/core/rng/              pcg32.ts, seeds.ts
    src/domain/protocol/       protocol.ts  (every constant, v1.1.0)
    src/domain/blocks/         speed-tap.ts (C1)
    src/analysis/              tap-stats.ts (descriptive only; real pipeline is M13)
    test/                      89 vitest tests
  app/                         <- React Native shell
    App.tsx                    mounts SpeedTapScreen
    src/screens/SpeedTapScreen.tsx
    src/timing/touch-clock.ts  provisional clock adapter, replaced at M8
    src/ui/theme.ts            elder-UI tokens
    android/                   Kotlin hook goes in MainActivity.kt at M8
```

## How to work

```bash
cd C:\src\fyp
npm run typecheck          # both workspaces
npm test                   # 89 core + 3 app
npm run test:core          # core only, ~1.5 s

# to see the app on the tablet (plug in, unlock, accept USB debugging prompt):
adb devices                              # expect R9JT1089PYN  device
adb reverse tcp:8081 tcp:8081
cd app && npx react-native start         # Metro, keep running
# app is already installed; launch it from the tablet, or:
adb shell am start -n com.kopitiamrhythm/.MainActivity
# native code changed? full rebuild (~7 min first time, faster after):
cd app/android && ./gradlew assembleDebug && adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Env vars are set at Windows User level; a terminal opened before they were set will not see
them. `JAVA_HOME`, `ANDROID_HOME`, `ANDROID_SDK_ROOT` and PATH entries for platform-tools.

## Commit conventions

- Multi-paragraph messages explaining *why*, written to a temp file and committed with `-F`
  (PowerShell here-strings do not pipe into git correctly).
- End with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- Commit only when the user asks or a milestone is done. Never push without asking.

## Working with this user

- Plain language. Technical density has repeatedly lost them; break things down, use tables,
  explain *why* in research terms not engineering terms.
- Small increments. Say what you are about to do *before* doing it — they have interrupted
  several times with "wait, what are you doing?"
- They ask "what's happening now?" often. Answer with a short status, not a lecture.
- They care about SOLID principles and scalable structure; show where each applies concretely.
- They are anxious about tablet accuracy and delay. Be honest and calibrated: say what is
  measured, what is assumed, and what is unknown. Do not reassure past the evidence.
- They are more fluent in React/TypeScript than anything else.
