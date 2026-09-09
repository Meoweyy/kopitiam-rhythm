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

### 2. Scored taps never come from Flutter's gesture system.

`GestureDetector` timestamps pass through the Flutter event loop and pick up 5–30 ms of
*load-dependent* latency. Because it varies, it inflates measured **variability** — which is the
primary outcome. A device that janks more would look like a participant with worse rhythm.

Scored taps come from the native touch hook (`MotionEvent.getEventTime()`, stamped by the kernel
input layer). Flutter pointer events drive visuals only. There is a test asserting that a
`GestureDetector` tap produces no row in `tap`.

### 3. `domain/` and `analysis/` are pure Dart.

No `package:flutter`, no `sqflite`, no `dart:io`. Enforced in CI. This is what lets a synthetic
15-session participant run headless in under a second, and what lets the statistical pipeline be
tested against data with known ground truth.

---

## Layout

```
app/          Flutter application
  lib/domain/     ports + protocol + blocks + session engine  (pure)
  lib/analysis/   cleaning, matching, metrics                  (pure)
  lib/timing/     adapters implementing domain/ports (fake + native)
  lib/data/       SQLite, repositories, CSV export
  lib/ui/         kopitiam presenters, researcher screens
shared/dsp/   platform-neutral C++ compiled into BOTH Android and iOS, so the
              two builds cannot drift into being different instruments
tools/        Python: loopback analysis, offline vocal onset detection
docs/         timing methods, calibration protocol, device qualification
```

The architecture in one line: `domain/ports/` names what the game needs, `timing/fake/` and
`timing/native/` supply it, and `bootstrap.dart` is the only file that knows both sides.

---

## Running it

```bash
cd app
flutter run -d windows                                # whole game, fakes, no tablet needed
dart test                                             # domain + analysis, pure
flutter test                                          # widgets, goldens
flutter run -d <tablet> --dart-define=AUTOPILOT=true  # real DB + UI, synthetic tapper
```

---

## Reproducibility

Every session records `protocol_version`, `generator_version`, `policy_version`,
`analysis_version`, `app_version`, `schema_version` and its `session_seed`. A session's exact
stimulus sequence can be regenerated from the seed alone.

The SDK version is **pinned** and checked in CI: Flutter's pointer resampling behaviour is part of
the measurement path, so a mid-trial `flutter upgrade` is a protocol deviation, not a chore.

Before data collection begins, `Protocol`, the pattern generator and the analysis module are
frozen and the collecting release is tagged.

---

## Never commit

Participant data, recordings, databases, the sealed randomisation list, PIN hashes. See
`.gitignore` — and note that a private remote is still a copy on someone else's server.
