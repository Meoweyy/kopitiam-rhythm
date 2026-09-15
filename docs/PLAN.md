# Kopitiam Rhythm — Incremental Build Plan

## Context

The FYP asks whether a self-administered rhythm game can train the internal clock in older
adults. The randomised two-arm trial (cue-fading vs cue-present) hinges on one number:
**continuation consistency in Block R4** — the CV of inter-tap intervals after the pacing cue is
withdrawn. Effects in this literature (Bangert & Balota 2012) are tens of milliseconds.

So this is **a measurement instrument wearing a game costume**. A timing bug found in March 2027
cannot be fixed — the participants are gone. That single fact drives the build order.

`桌面\fyp` is empty; this is greenfield, and it moves to `C:\src\fyp` under git at M0. Today is
9 Sep 2026, and the report's timeline puts "R1 with timestamp logging on tablet" in Aug–Sep and
"R2–R4 + cue-fading" in Oct. This plan covers that window as **13 small milestones**, each
independently runnable.

---

## The one rule everything else follows

> **Store raw monotonic timestamps. Never write a corrected timestamp to the database.
> Apply latency correction at analysis time, in exactly one pure function.**

Calibration bugs are found *after* data collection. A study whose raw data was baked with a wrong
constant is dead; one that stored raw values plus a calibration row is re-analysed in ten minutes.
"Was the correction applied twice?" is a real bug that this rule makes structurally impossible.

Corollary: **scored taps never come from Flutter's gesture system.** `GestureDetector` timestamps
pass through the Flutter event loop and pick up 5–30 ms of *load-dependent* latency. Because it
varies, it inflates measured variability — which is the primary outcome. A device that janks more
would look like a participant with worse rhythm.

---

## How we build

**Smallest useful increment, always runnable, refactor when the third case arrives.**

Three habits that make this work:

1. **Every milestone ends with something you can run or a test that passes.** No milestone leaves
   the tree broken or half-abstracted.
2. **Abstractions are extracted, not guessed.** Write C1 concretely. Write C2 concretely. *Then*
   extract `Block` from the two of them — by which point you know what actually varies. An
   interface designed before its first implementation is a guess, and guesses about seven blocks
   you haven't written are expensive to unwind.
3. **Sequence by dependency, not by excitement.** C1 and C2 need *no audio* — they are free
   tapping in a fixed window. So a real, hardware-valid block ships on a tablet with only the
   touch hook written. Oboe can wait until M8.

---

## SOLID, as it applies here

Not decoration — each principle earns its place by solving a specific problem in this project.

### Interface segregation: split the timing layer by capability

One fat `TimingLayer` would force C1 (which needs a clock and taps) to depend on audio recording
and beat scheduling it never uses, and would make every fake enormous. Instead, `domain/ports/`
defines five small interfaces:

```dart
abstract interface class Clock          { int nowMs(); }
abstract interface class TapSource      { Stream<TapEvent> get taps; }
abstract interface class BeatScheduler  { Future<void> schedule(List<BeatSpec> b);
                                          Future<List<ActualOnset>> reportedOnsets();
                                          Future<void> stop(); }
abstract interface class AudioRecorder  { Future<void> start(TrialId id);
                                          Future<String?> stop(); }
abstract interface class LatencyCalibrator { Future<DeviceLatency> current();
                                             Future<DeviceLatency> run(CalibrationMethod m); }
```

Each block declares exactly what it needs:

| Block | Clock | TapSource | BeatScheduler | AudioRecorder |
|---|:-:|:-:|:-:|:-:|
| C1, C2 | ✓ | ✓ | | |
| R1–R4 | ✓ | ✓ | ✓ | |
| V1 | ✓ | ✓ | ✓ | ✓ |

This is why C1 can be finished and validated on hardware before any audio code exists.

### Dependency inversion: ports live in `domain/`, adapters live outside

`domain/` defines the interfaces it needs and imports nothing from `data/`, `timing/` or Flutter.
`bootstrap.dart` is the only file that knows both sides and wires them together. Enforced by a CI
check: no `import 'package:flutter'`, `sqflite`, or `dart:io` anywhere under `domain/` or
`analysis/`.

### Liskov: one contract suite, run against every implementation

`FakeTapSource` must be substitutable for `NativeTapSource` or desktop development is a lie. Make
that testable — write the contract once, run it against both:

```dart
// test/ports/tap_source_contract.dart
void tapSourceContract(String name, TapSource Function() make) {
  group('TapSource contract: $name', () {
    test('timestamps are monotonically non-decreasing', ...);
    test('every down is followed by an up or a cancel', ...);
    test('no event is delivered after stop()', ...);
  });
}
```

Run against the fake in CI, against the native adapter in `integration_test/` on-device. Any
divergence between your laptop and the tablet surfaces as a failing test rather than as strange
data in February.

### Open/closed: registries, not switch statements

Adding R2 must not modify `SessionRunner`. Adding Wing–Kristofferson must not modify the exporter.
Three registries carry this:

```dart
// domain/session/block_registry.dart  — BlockId -> Block factory
// domain/adaptive/policy_registry.dart — new AdaptivePolicy, no runner change
// analysis/measure_registry.dart       — List<TrialMeasure> the export iterates
abstract interface class TrialMeasure<T> { String get name; T? compute(CleanedTrial t); }
```

Adding a derived measure in January = one new file plus one registry line. No edit to code that
already produced valid data.

### Single responsibility: the boundaries that matter

- `TrialRunner` is the **only** code that talks to the ports. One place to audit for timing bugs.
- `Block` says *what to play*; `Scorer` computes *pass/fail*; `Repository` *persists*. Three
  different reasons to change, three separate classes.
- Each cleaning step (debounce, palm rejection, outlier policy) is its own class with its own
  test, composed into a pipeline — because these are exactly the rules your supervisor will make
  you revise after draft 1.

### The layout that follows from it

```
C:\src\fyp\                          (git repo, private GitHub remote)
  app/
    lib/
      core/          rng/pcg32.dart, seeds.dart, ids.dart
      domain/                          <- imports NO flutter, NO sqflite, NO dart:io
        ports/       clock.dart, tap_source.dart, beat_scheduler.dart,
                     audio_recorder.dart, latency_calibrator.dart
        protocol/    protocol.dart     <- every numeric constant, one const object
        session/     block.dart, block_registry.dart, trial_plan.dart,
                     trial_runner.dart, session_runner.dart
        blocks/      c1_speed_tap.dart, c2_natural_tempo.dart, r1_single_hand.dart
        pattern/     pattern.dart, constraints.dart, generator.dart
        adaptive/    adaptive_policy.dart, length_staircase.dart, policy_registry.dart
      analysis/                        <- pure, same import ban
                     cleaning/, matching.dart, intervals.dart,
                     measures/, measure_registry.dart
      timing/                          <- ADAPTERS implementing domain/ports
        fake/        virtual_clock.dart, fake_tap_source.dart, synthetic_tapper.dart
        native/      native_tap_source.dart, native_beat_scheduler.dart
        guards.dart, calibration.dart
      data/          db/, repo/, export/, recovery/
      ui/            theme/elder_theme.dart, session/, researcher/
      bootstrap.dart                   <- the ONLY file that knows both sides
    assets/sql/schema_v1.sql
    android/app/src/main/kotlin/...    MainActivity.kt, TouchRecorder.kt   (M8)
    android/app/src/main/cpp/          audio_engine.cpp                    (M9)
    ios/Runner/                        Swift adapters                      (Dec)
  shared/dsp/        platform-neutral C++ compiled into BOTH targets, so Android
                     and iOS cannot drift into being different instruments
  tools/             Python: analyze_loopback.py, onset_offline.py
  docs/              timing_methods.md, calibration_protocol.md
```

The `domain/ports` ← `timing/fake` + `timing/native` split is the whole architecture in one
picture: the domain names what it needs, two adapters supply it, and `bootstrap.dart` picks.

---

## Decisions locked

| Decision | Choice |
|---|---|
| Stack | Flutter (Dart) + native timing adapters behind `domain/ports/` |
| Native order | **Kotlin/Oboe now**; Swift in Dec against the same ports |
| Devices | Android tablets for the trial; iPad after the Nov pilot |
| Data | on-device SQLite (WAL, `synchronous=FULL`) + tidy CSV export |
| Laterality | two kettles, left and right, response pad beneath each |
| Teh tarik (hold/release) | training trials only, never in scored probes |
| Blackout | power cut — lights out, audio off, table turns unseen, reveal on lights-up |
| Measurement protocol | fixed and identical for both arms at baseline/post-test; `session_kind` selects the policy set, never `arm` |

---

## The kopitiam UI, mapped to the research design

```
+--------------------------------------------------+
|  auntie                                          |
|                  .-~  o   o  ~-.                 |
|               o                   o              |
|   [KETTLE] <-- o                  o --> [KETTLE] |
|      ^          `-.  o   o   o .-'         ^     |
|      |            (lazy susan turns)       |     |
+---------------------+----------------------------+
|      LEFT PAD       |       RIGHT PAD            |
+---------------------+----------------------------+
```

| Game element | Research role |
|---|---|
| Table turning at the participant's tempo | continuous visual pacing cue; phase computed from the master clock, **never** an `AnimationController` |
| Cup reaching the left kettle | a *left* beat — the Simon stimulus |
| R2 natural / R3 mirror | left cup → left pad / left cup → **right** pad; the reversal yielding crossing cost |
| Kopi cup (quick tap) | the scored event |
| Teh tarik glass (hold, release on the end beat) | training difficulty tier; yields `touch_down` **and** `touch_up` |
| Power cut (R4) | cue withdrawal — the primary outcome |
| Kopi cup filling | progress art; fills on *completion*, never on performance |

**Three things that are easy to get wrong:**

1. **The table's motion is a cue.** If it keeps visibly turning during the power cut, the cue was
   never withdrawn and the primary outcome measures nothing. Lights out, audio off, table turning
   *behind* the darkness so the lights-up reveal shows where the cups landed — and that reveal
   doubles as the trailing audio marker the timing alignment needs.
2. **Holds and taps are different events.** A trial mixing them is no longer a single clean
   interval series, which continuation consistency and the Wing–Kristofferson split both require.
3. **Feedback is one-directional.** A good tap blooms a ring and the auntie nods. A miss produces
   *absolutely nothing*. No score, percentage or streak is ever shown to a participant.

---

## Milestones

Sizes assume solo work. Each is a stopping point: the tree builds, tests pass, something runs.

### Part A — laptop only, no tablet needed

**M0 · Toolchain, repo, skeleton** · ~2–3 h
No Dart yet — the environment isn't ready. Flutter 3.24.5 sits inside OneDrive and isn't on PATH,
and there is no Android SDK.

1. **Move the SDK out of OneDrive** → `C:\src\flutter`; add `C:\src\flutter\bin` to PATH; then
   `flutter upgrade` to current stable. OneDrive dehydrates and locks files mid-sync, and across
   ~20 000 SDK files that produces intermittent build failures which look like Flutter bugs.
2. **Install Android Studio**, then `flutter doctor --android-licenses` until `flutter doctor` is
   clean. (M0–M7 run on Windows desktop, but getting this out of the way now avoids a detour at M8.)
3. **Move the project** → `C:\src\fyp`; `git init`; `.gitignore` covering `build/`, `.dart_tool/`,
   `*.db`, `*.wav`, `export/`; push to a private GitHub remote. The plan needs git for real:
   committed golden seed vectors, a committed `protocol_v1.json`, and a tag on the exact commit
   that collected each participant's data.
4. **Pin the SDK version** in the repo and check it in CI. The pointer-resampling guard at M8
   exists precisely because a mid-trial `flutter upgrade` could change how timestamps are
   produced — the SDK version is part of the instrument, not an incidental detail.
5. `flutter create app`, folder skeleton, and the **import guard**: fail CI if anything under
   `domain/` or `analysis/` imports `package:flutter`, `sqflite`, or `dart:io`.

*Done:* `flutter doctor` clean; `flutter run -d windows` shows the kopitiam table and the auntie;
first commit pushed.

**M1 · Deterministic randomness + protocol constants** · ~half a day
`core/rng/pcg32.dart`, `seeds.dart`, `domain/protocol/protocol.dart`.
Do *not* use `dart:math`'s `Random(seed)` — its algorithm isn't stable across Dart SDK versions,
which would silently break reproducibility between your pilot and your final run. Seeds derive
`study → session → block → trial` so you can replay P017/S09/R4/trial-3 in isolation.
*Done:* golden seed vector committed; `protocol_v1.json` generated.

**M2 · The ports and their fakes** · ~1 day
`domain/ports/*.dart` (the five interfaces above), `timing/fake/` implementations,
`VirtualClock`, and `SyntheticTapper` — parameterised by `meanAsynchronyMs`, `clockSd`,
`motorSd`, `missRate`, `extraRate`, `driftMsPerInterval`, `doubleTouchRate`, i.e. it generates a
true Wing–Kristofferson process **with known parameters**. Plus the LSP contract suite.
This is the highest-leverage asset in the build: it is what later lets you assert your analysis
recovers the variance you injected.
*Done:* contract tests green against the fakes; 20 beats in, 20 synthetic taps out.

**M3 · C1 speed tap, concretely** · ~half a day
One screen, two pads, a 10 s window per hand. No `Block` interface yet — write it plainly.
*Done:* playable on desktop; prints the ITI series and its SD to the console.

**M4 · C2 natural tempo, concretely** · ~half a day
Second 10 s window, median ITI, clamped 500–900 ms. The clamped value is **locked at session 1
and never recomputed** — later sessions' C2 is kept for monitoring only.
*Done:* playable; prints the locked tempo.

**M5 · Extract `Block` from C1 and C2** · ~half a day
*Now* the abstraction is earned. Pull out the `Block` contract, `TrialPlan`, `TrialRunner`,
`SessionRunner`, `BlockRegistry`. C1 and C2 become two ~30-line classes.

The modelling insight to encode here: **every block is a schedule of beats, some rendered and
some silent, plus a window in which responses are collected.** C1/C2 have zero beats. R1–R3
render all of them. R4 renders the first *k* and marks the rest **phantom** — scheduled, logged,
used as asynchrony targets, never played. That single idea is what makes blackout continuation
measurable through the same code path as synchronisation, with no methodological seam at the
cue-offset boundary.
*Done:* both blocks run through one `SessionRunner`; behaviour unchanged; tests still green.

**M6 · Persistence** · ~1 day
`schema_v1.sql`, DAOs, `writeTrialAtomic()`. One transaction per trial, committed in the
inter-trial gap while the participant reads "Nice, ready for the next one?" — not per tap (DB I/O
during timed play causes jank), not per session (total loss on crash). Plus `JsonlMirror`, a
20-line append-only mirror so a corrupt SQLite file never costs you the dataset.
Two schema points that carry weight: the `beat` table stores **phantom beats**; the `tap` table
stores **rejected taps with a `rejection_code`**, never drops them — if 30% of a participant's
taps are being debounced, you must be able to discover that from the data.
*Invariant:* a trial is either fully present or entirely absent.
*Done:* kill-mid-write test asserts no partial trial; `PRAGMA integrity_check` clean.

**M7 · First CSV export** · ~half a day
`taps.csv`, `trials.csv`, `sessions.csv` + `codebook.csv`. Raw times only.
*Done:* run C1+C2 on desktop, export, open in R, row counts match.

### Part B — real hardware

**M8 · Kotlin touch hook (no audio)** · ~1–2 days
Hook `Activity.dispatchTouchEvent` and record `MotionEvent.getEventTime()` before the view
hierarchy sees it. Not a native overlay (breaks hit-testing), not a `FlutterView` subclass
(engine-internal, version-fragile). Wire it as `NativeTapSource`; run the M2 contract suite
against it on-device.
Add `timing/guards.dart`: **throw at startup if `GestureBinding.resamplingEnabled` is true.**
Flutter's pointer resampling *synthesises* timestamps on a fixed cadence, which smooths the tap
stream and artificially *reduces* measured variability. The data still looks perfectly plausible,
and if it hits the arms unequally it manufactures or destroys an effect. This is the most
dangerous silent failure in the whole build.
*Done:* **C1 and C2 run on a real tablet with real kernel timestamps and export valid data.**
That is a genuine, defensible research result with zero audio code written.

**M9 · Kotlin Oboe audio** · ~3–4 days
Pre-render the whole trial's cue track into one PCM buffer before the trial starts; the blackout
is simply silence in it. One scheduling decision per trial instead of one per beat: no enqueue
race, no jitter, and the render callback becomes a `memcpy`.
Beat placement `frame_k = F0 + llround(k * ioi_s * actualSampleRate)` — absolute, never
accumulated (±10 µs, non-accumulating).
**Read back what you actually got.** A device that silently opens at 44.1 kHz when you asked for
48 kHz makes every IOI wrong by 8.8%, and the game still plays fine, slightly fast.
Clock map: rolling least-squares `t_mono = α·frame + β` from `AAudioStream_getTimestamp` anchors,
frozen at trial start so beat times can't retroactively change.
*Done:* V3 below passes — the device's own clicks, recorded acoustically, are isochronous to <1 ms.

**M10 · Calibration + the "no calibration, no session" rule** · ~1 day
In-app loopback: play a 10 ms 1–4 kHz chirp, record it, matched-filter with parabolic
interpolation. A chirp not a click — the matched filter gives a sharp high-SNR peak where a bare
click gives a smeared one. Then **refuse to start a session without an active calibration row for
this device.** That is the most common way a timing study is silently ruined.
*Done:* calibration screen writes a row; session launch is blocked without one.

**M11 · Patterns + staircase** · ~1 day
A pattern is **isochronous in time, random in space**: every beat on the grid, the pattern is the
side sequence (`LRRL`). Required for W-K validity and for CV-of-ITI to mean anything.
Constraints: side balance, no run >2, not strictly alternating, Hamming ≥2 from the previous, not
used in this participant's last 2 sessions. At length 4 this leaves **exactly 4 legal codes** —
`LLRR, LRRL, RLLR, RRLL` — so probes sample without replacement and difficulty at the scored
length is *exactly* balanced across participants, sessions and arms. A strong methods claim, free.
Staircase: 2-down/1-up on length, floor 3, no ceiling. `observe()` is a pure state transition —
no clocks, no DB, no randomness — so the policy is property-testable and `adaptive_event` is a
complete record the trajectory can be recomputed from in R.
*Done:* property tests over 10 000 samples; golden corpus committed.

**M12 · R1 with the full kopitiam presenter** · ~2–3 days
Turning table, two kettles, cups on the rim. Demo phase → practice → 2-item pictorial
comprehension check → scored trials. Probe trials (always L=4) and adaptive trials interleave at
fixed positions; **only probes enter the primary analysis**, and probes never move the staircase.
Elder UI: 24 sp body / 32 sp instructions / 40 sp headline; 7:1 contrast, charcoal `#1A1A1A` on
warm off-white `#FFFBF2` (warm ground reduces glare for yellowed lenses); amber flash, never
saturated blue; 72×72 dp minimum on non-play controls; landscape locked; no swipes or
long-presses anywhere in the participant flow.
*Done:* R1 playable end-to-end on a tablet.

**M13 · Analysis + researcher screen + recovery** · ~2–3 days
`analysis/` — pure Dart, zero Flutter, zero DB. Cleaning runs in a fixed order before any SD is
computed: latency correction → window filter → phase assignment → per-pad debounce (100 ms;
70 ms in C1) → palm/long-press rejection → matching → intervals → sufficiency gate.
Two rules that have ruined published tapping datasets:
- **A doubled interval is excluded, not halved.** Halving fabricates two observations from one
  and deflates variance.
- **Never compute a statistic below its minimum N** (CV: 10 intervals; W-K: 25). Emit `null` with
  a reason instead of a number derived from 4 intervals.

Researcher screen: PIN-gated (3 s long-press on the teapot), enrolment, arm allocation **consumed
from a sealed list imported as CSV** so the app can never re-allocate — what an ethics committee
wants to see — export, and a live monitor with an asynchrony raster and an end-of-session flag
card ("R4 trial 3: 12 continuation taps, expected ~28 — check"). That card catches a broken
session while the participant is still in the room.
Crash recovery: same participant, same day, last trial <30 min ago → offer Resume, skipping
completed blocks, always restarting an interrupted block from its instructions.

### Slice-complete criterion

On a real Android tablet: enrol P001 → calibrate → C1 + C2 + R1 → force-quit mid-session →
relaunch → recover → finish → export → open in R → **and regenerate the session's exact patterns
from `session_seed` alone.**

---

## After the slice

Each of these is *additive* under the registries — no edits to code that already produced data.

| Phase | Content | Target |
|---|---|---|
| 1 | R2 → R3 (mirror, 12% slower, mandatory comprehension check, skippable) → R4 with phantom beats + the power cut → `continuation_metrics`, `drift`, `wing_kristofferson`, crossing cost | Oct 2026 |
| 2 | `CueFadingController` + published 9-rung ladder + guard rails → `FixedCuePolicy` (Arm B) → `MeasurementProtocolPolicy` and the `session_kind`-driven plan builder → teh tarik as a training tier | Oct 2026 |
| 3 | V1 vocal: PCM capture, click-leakage alignment, offline onset detection | Nov 2026 |
| 4 | Swift adapters against the same ports; re-run the contract suite and validation on iPad | Dec 2026 |
| 5 | Senior pilot, then **freeze** `protocol_version`, `generator_version`, `analysis_version` and tag the release that collects the data | Dec 2026 |

**Cue-fading control law** (Phase 2, stated now because it must be pre-registrable): after each
adaptive R4 trial compute `CV_cont` on the cleaned continuation series, excluding the first two
intervals after cue offset. Take the median over the last 3 valid trials. Step up if ≤ `θ_up`,
down if > `θ_down`, where `θ_up = max(0.05, 1.25 × baseline_sync_cv)` and
`θ_down = max(0.09, 1.75 × baseline_sync_cv)`, with `baseline_sync_cv` frozen from that
participant's session-1 R1 probes. A published 9-rung lookup table beats a continuous control law:
it is auditable, and "cue-fading level 0–8" is a single reportable number.

---

## Verification

### Software tests (CI, no device)

- **Port contract suite** (M2) — run against every fake and, on-device, every native adapter.
- **W-K recovery:** 1000 series with known σ²_C and σ²_M; assert recovery within ~15%. Assert the
  invalid-fit path (`γ(1) ≥ 0`, expected in 10–30% of older-adult series — report the proportion,
  a reviewer will ask), that detrending removes injected drift, and that lag-1 pairs are never
  computed across an excluded gap.
- **Matching:** perfect trial, one missed beat, one extra tap, a tap exactly at the ±T/2 boundary,
  two taps competing for one beat.
- **Staircase & cue-fading:** property tests over 10 000 random outcome sequences — level stays in
  range, never moves more than one rung per trial, every guard rail named.
- **Negative test, load-bearing:** assert a `GestureDetector` tap on a pad produces **no** row in
  `tap`. Encode the invariant so nobody — including you at 3 a.m. in week 11 — wires the gesture
  handler into the log.
- **Closed loop:** run a synthetic 15-session participant headless; assert the staircase converged
  where the tapper's parameters imply and that the analysis recovers the injected σ²_C/σ²_M. A
  genuinely strong thing to demonstrate in a viva.

### Hardware validation, before any participant

| # | Test | Pass criterion | After |
|---|---|---|---|
| V1 | Clock identity — 1000 paired native reads; Dart `Stopwatch` offset over 20 min | agreement <100 µs; drift <1 ms | M8 |
| V2 | Electrical loopback, TRRS plug, 50 repeats. *Run first — it finds software bugs* | SD <0.5 ms | M9 |
| V3 | Beat isochrony measured acoustically — 300 of the device's own clicks | SD <1 ms. The sentence proving the *stimulus* isn't the source of variability | M9 |
| V4 | Flutter-vs-native tap agreement, 500 taps | SD(Δ) <0.5 ms, 0% unmatched | M8 |
| V5 | Mechanical tapper at 500 ms and at 125 ms (the C1 rate) | SD <3 / <4 ms, **zero dropped or duplicated taps** | M8 |
| V6 | Drift-rate end-to-end — tapper at +2% off tempo; asynchrony must drift linearly at 12 ms/beat | rate within 0.5%, R² >0.999 | M12 |
| V7 | Thermal/load — 25 min session on a pre-warmed device at full brightness | zero xruns in measured windows; dispatch latency p99 <20 ms | M12 |

V6 is the one to build toward: it validates beat attribution, the clock map and the asynchrony
maths end-to-end, and it needs **no clock synchronisation** between rig and tablet, because you
check a *rate*, not an offset. A bug in almost any component breaks the linearity.

The rig for V5–V6 is a laptop + USB audio interface, a mic, a phototransistor taped over a
kettle's flash region, and a solenoid with a conductive tip (~$15, one weekend). **Claim `L_out`
to ±3 ms, not better** — the stylus-impact-vs-capacitive-registration assumption is the accuracy
floor and belongs in the limitations.

### Running it

```
cd app
flutter run -d windows                                  # whole game, fakes, no tablet
dart test                                               # domain + analysis, pure
flutter test                                            # widgets, goldens at textScale 1.0 / 1.6
flutter run -d <tablet> --dart-define=AUTOPILOT=true    # real DB + UI, synthetic tapper
```

---

## Open item for your supervisor

**Measurement-session continuation length.** 15 s at 700 ms gives ~21 intervals — marginal for
Wing–Kristofferson, whose estimator variance is large below ~30. This plan assumes **25 s at
measurement sessions only** (~35 intervals), which is part of why the measurement protocol is
separated from the training ladder. If W-K is a headline result, confirm it; if it is a secondary
diagnostic, 15 s is defensible and the ladder can stay as the report specifies.
