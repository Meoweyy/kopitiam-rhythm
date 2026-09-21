# Handoff — where the previous session stopped and everything it learned

First written 16 Sep 2026; §1 and §11 last updated **21 Sep 2026**. This is the complete
context a new session needs. `CLAUDE.md` is the short version; `docs/PLAN.md` is the milestone
plan; the user's proposal is `Rhythm_Training_FYP_Report` (they can share it).

---

## 1. Where we stopped — read this first

**State on 21 Sep 2026: tree clean at `3de77b6`. Four blocks and the audio engine work on the
tablet. Nothing is saved yet — the next milestone is persistence (M6).**

| Built | Commit | Status |
|---|---|---|
| C1 speed tap | `ca097e4`, `57cea90` | ✅ on tablet |
| C2 natural tempo — median gap, clamped 500–900, locked, used by R1/R4 | `5c6dc53` | ✅ on tablet |
| R1 the kettle — turning table, flash, pad, one-directional bloom, click track | pieces `6a208b0`…`3e19d03`, audio `c9ebba8`…`6050c06` | ✅ on tablet |
| R4 the power cut — phantom beats, silence in the buffer, lights out/up, continuation summary | `3de77b6` | ✅ on tablet; user's first run: continuation CV 5.1%, drift +9.4% slowing |
| Audio engine (Kotlin `AudioTrack`, TurboModule) — one `play()` per trial, clock map | `c9ebba8`, `4690930`, `13aacfa` | ✅ tablet qualified: 48 kHz, fast path granted, timestamps stable to ~0.02 ms |

**What the app is right now:** a developer menu (`App.tsx`) that opens each block directly.
C2 locks a tempo into App state for the life of the process; R1 and R4 use it, else a 700 ms
placeholder. No session runner, no persistence, no export. Every run is lost on leaving the
screen — the user's R4 result exists only as a photo.

**What was decided this week (not derivable from code):**
- **M4 (C2) was on hold, then built** on 17 Sep once it was clear the whole design anchors on
  the personal tempo.
- **Measurement sessions: fixed 8 cued beats, one locked tempo.** The user asked whether the
  cut-off should be random; answer no — knowing when the cue stops does not help keep time
  without it, and a varying cued count would confound the primary outcome (more cue → steadier
  continuation). Variation lives in the training ladder (16 → 3 cued beats). Recorded in
  `beat-schedule.ts`.
- **Training tempo may vary between sets** (fixed within a set), following BAASTA's multi-tempo
  assessment design and Rhythm Workers' training structure (worlds at 100/90/110/80… BPM,
  difficulty = distance from the natural tempo). This is a change from the proposal → **for the
  supervisor**, not built. Measurement sessions stay at the locked tempo.
- **No count-in clicks** (user rejected). The lead-in is 2 beats of visible approach. The first
  beat is still unpredictable (+103 ms on the R4 run); BAASTA discards early taps and M13 will.
- **Literature reviewed with the user** (full texts read): BAASTA (Dalla Bella 2017) supports
  the *method* — sync–continuation, CV of ITI, 100 ms artefact, ±50 % window, per-tempo norms,
  variability differs by tempo; it says nothing about training or cognition. Rhythm Workers
  (Bégel 2018) supports the *training structure* and feasibility only — its tapping group showed
  no significant improvement; efficacy evidence is the 2022 Parkinson's pilot (d = 0.75, n = 12).
  Suggested to the user: add BAASTA's anisochrony-detection listening test as a transfer measure.
- **UI:** a mock-up canvas exists (`https://claude.ai/artifact/RbyDDZCkQmXjyDsNCXggEt`): three
  directions, then a hand-drawn kopitiam version. The user wants the style of a doodle
  illustration they found online (thick ink lines, warm flat colour, 3/4 table). That needs real
  artwork — two generation prompts were given (scene + single cup) to save as
  `docs/design/scene.png` and `cup.png`; **not done**. User chose to finish functionality first.
- **Sound sources:** click synthesised in code; backing music from sample-pack hits placed on
  the grid (S6, not built); backing must stop at blackout and be off in V1.

**Landmine (18 Sep, cost an hour):** a screen whose content overflows the viewport breaks
native view mounting on this RN build — see §4 gotchas. Every screen fits or scrolls.

**Immediate next step: M6 persistence.** Piece 1 is pure core: the saved shape of a trial (tap
rows with raw timestamps + acceptance + reason + matched beat; beat rows with cued/phantom;
trial row with block, tempo, protocol version, audio report). Then SQLite, one transaction per
trial after it ends; a runs screen; CSV export (M7). Then tidy R4's results (hide the overall
asynchrony SD and hit count, which mislead under drift), then M5 extraction, then M8.

### 1b. The health check (16 Sep) — kept for the record

**Mid-way through a "health check" the user asked for** before building further. The idea:
check early for the silent failures that would otherwise surface late in production.

The check had five parts. Status:

| # | Check | Status |
|---|---|---|
| 1 | Touch scan rate of the tablet's digitiser | **Done (16 Sep)** — ~120 Hz, see §5 |
| 2 | Whether the tablet supports low-latency audio | **Done** — it does not declare it (§5) |
| 3 | Does a release APK work standalone (no Metro)? | **Done (16 Sep) — yes.** `assembleRelease` 5m13s, 51.5 MB, signed with the debug keystore (RN template default). Installed with Metro stopped and `adb reverse --remove-all`; C1 played normally |
| 4 | Does the app survive backgrounding / screen-off mid-run? | **Done (16 Sep) — survives.** Power button pressed ~4 s into a run; the JS timer kept running in the dark and the window closed normally. Process was not killed. **Design consequence:** a trial interrupted this way would look complete but be missing taps — the session runner (M5) must invalidate and restart an interrupted trial from its instructions. Plan already says so; this confirms it is needed, not theoretical |
| 5 | Full test suite + typecheck | Was green at last run (92 tests) |

**Health check complete.** All five parts done; nothing found that changes the plan.

**Release-build jitter finding.** The same C1 run on the release build reported delivery jitter
**1.1 ms** against 3.8–4.4 ms on debug builds (§5, §6). Debug builds carry dev-mode overhead on
the JS thread. Consequences: (a) the study runs release builds, no exceptions; (b) any timing
figure that is *reported* must come from a release build — debug numbers are development
evidence only. **The tablet currently has the release build installed;** the next
`gradlew assembleDebug && adb install -r` replaces it, and `adb reverse tcp:8081 tcp:8081` must
be re-run before Metro will work (the tunnel was removed for the standalone test).

**How #1 was measured (16 Sep).** `adb shell getevent` is blocked — the touch device is
`crw-rw---- system:input` and the `shell` user cannot read it; the tablet is not rooted. What
works instead: `adb shell dumpsys input` prints the InputDispatcher's `RecentQueue`, the last
ten events with their age in whole milliseconds. Drag a finger, lift, run the command, and the
differences between ages are the raw inter-report intervals from the touch panel — before any
batching. Two drags gave `8 8 8 9 8 16 9 16 83` and `9 8 8 8 17 8 25 25 66`: a base period of
~8.3 ms with occasional skipped reports (multiples of 8) as the finger slows, and the long
final gap is the lift. **~120 Hz.**

**Do not measure this from inside the app via React Native.** Android batches `ACTION_MOVE`
samples and delivers one `MotionEvent` per vsync; RN exposes only `getEventTime()` of the
latest sample, not `getHistoricalEventTime()`. An in-app move-interval histogram would report
the 60 Hz display rate, not the digitiser rate. Reading history requires native code — M8.

Metro was running in the background and has since stopped. Restart per `CLAUDE.md`.

---

## 2. Timeline

- **8 Sep** — User shared the FYP proposal PDF. Long planning phase: two Plan agents designed the
  timing core and the app architecture. Plan approved after several rounds. Initial stack: Flutter.
- **9 Sep** — M0 built in Flutter (`ce7b63d`). User then said they are more fluent in
  React/TypeScript. **Switched to React Native** (`eadd14c`). M1 built (`53c83dd`).
- **10 Sep** — Android toolchain installed. Tablet connected. **M2 deliberately skipped** (see §8)
  to get something on screen sooner. M3 built and run on the tablet (`ca097e4`). User's own
  tapping data exposed a bug in C1; fixed (`57cea90`). Health check started, then paused.
- **16 Sep** — First handoff. Later the same day: touch scan rate measured (§1b, §5). User put
  **M4 (C2) on hold** and chose to build the kettle game (R1) next, visual first, audio after.
  Same day: health check finished; R1 built in eight pieces (visual only); audio S1 (hello
  click + readout) — the tablet's audio path qualified.
- **17 Sep** — Audio S2–S4 (click track, clock map, kettle clicks). Literature discussion
  (BAASTA, Rhythm Workers, the proposal). C2 built. R4 started; user asked for the UI to be
  improved first → mock-up canvas, then chose functionality first.
- **18 Sep** — R4 finished after an hour lost to the screen-overflow mounting bug (§4).
  First R4 run on the tablet.
- **21 Sep** — Handoff refreshed (§1, §11). Next: M6 persistence.

---

## 3. What is built

Five commits on `main`, no remote (GitHub CLI not installed; user must create the repo and
authenticate). Clean tree.

### `ce7b63d` — M0 (Flutter) — superseded
Flutter SDK moved out of OneDrive to `C:\src\flutter`, upgraded 3.24.5 → 3.47.2. Still on disk
and on PATH but **no longer used**. Safe to delete (~2 GB) if disk is needed.

### `eadd14c` — M0 (React Native)
- RN 0.87.1 scaffolded into `app/`. npm workspaces root.
- `packages/core` created as a pure-TS package. Purity is a compile error: tsconfig has
  `"lib": ["ES2022"]`, `"types": []`, no runtime deps. **Verified by probe**: a file importing
  `react-native` fails TS2307; one reading `process.env` fails TS2591. Probes deleted after.
- `purity.test.ts` guards the ways that could be undone later (new dep, new import, relaxed
  tsconfig). Also verified to actually fail against a probe.
- Metro configured for the monorepo (`watchFolders`, `nodeModulesPaths`,
  `disableHierarchicalLookup`).
- `.gitignore` excludes all participant data patterns (`*.db`, `*.wav`, `export/`,
  `allocation*.csv`, `pin_hash*`). `.gitattributes` normalises to LF.
- CI workflow (`.github/workflows/ci.yml`): `npm ci`, typecheck + test both workspaces.

### `53c83dd` — M1: seeded randomness + protocol constants
- `packages/core/src/core/rng/pcg32.ts` — PCG32 XSH-RR 64/32 in ~40 lines with BigInt.
  **Verified against the official reference vector**: seed 42, stream 54 →
  `a15c02b7 7b47f409 ba1d3330 83d2f293 bfa4784b cbed606e`. `nextInt` uses rejection sampling
  (modulo bias would confound mirror mode's left/right balance). Fisher–Yates shuffle.
- `seeds.ts` — splitmix64 + FNV-1a. Derivation `study → session → block → trial` so any trial
  is regenerable in isolation. Tested: zero collisions across 60×15×7×40 = 252,000 seeds;
  avalanche ~32 bits per one-bit input change.
- `protocol.ts` — every study constant in one deep-frozen object. Snapshot-locked. Now at
  **v1.1.0**. Includes consistency tests coupling constants that must agree.

### `ca097e4` — M3: block C1 (speed tap)
- `speed-tap.ts` — `SpeedTapRun`, a pure state machine. Time is an argument. 70 ms per-pad
  debounce measured from the last *accepted* tap. Rejected taps recorded with reason.
- `tap-stats.ts` — mean/median/sample-SD/CV. Returns `null`, never `NaN`. **Explicitly not
  the analysis pipeline** (that is M13, with cleaning rules applied in fixed order).
- `app/src/screens/SpeedTapScreen.tsx` — intro → 10 s window → results, per hand.
- `app/src/timing/touch-clock.ts` — provisional. Reads `nativeEvent.timestamp` (kernel time on
  Android) and estimates a single-sample offset to the JS clock. Replaced at M8.
- `app/src/ui/theme.ts` — warm ground `#FFFBF2`, charcoal `#1A1A1A`, amber accents, 20 sp
  minimum type, 72 dp minimum controls.
- `jest.config.js` — `modulePaths` pointing at `app/node_modules` because `@babel/runtime` was
  not hoisted and Jest could not resolve it from files in `packages/core`.

### `57cea90` — C1 fix: window starts on the first tap
**Found from the user's real data**, not from code review. Their run: 61 taps at 150 ms mean
gap = 9.0 s of tapping in a 10 s window — about a second was spent moving the hand from the
"ready" button to the pad. Rate reported 6.1/s, true 6.67/s, an 8.5% undercount, and the gap is
person-specific (longer in older adults) so it would confound the very covariate C1 exists to
provide. Fix: run is *armed* by the button, *started* by the first accepted tap. Added
`startTimeoutMs` (20 s) and `spanMs`. PROTOCOL_VERSION bumped to v1.1.0 — the snapshot test
caught the change and refused to pass until the version moved, exactly as designed.

### 16 Sep — R1, the kettle game, visual only (`6a208b0` … `3e19d03`)

Built in eight small pieces, each verified on the tablet before the next. **M4 (C2) is on
hold** by the user's decision; R1 was built directly on a placeholder tempo.

| Piece | What | Where |
|---|---|---|
| 1 | Beat schedule — `start + k × ioi`, multiplied never accumulated, frozen | `core/src/domain/beats/beat-schedule.ts` |
| 2a | Matching — one function for live feedback *and* analysis; inclusive window, closest-first, ties to earlier beat; asynchrony = tap − beat | `core/src/analysis/matching.ts` |
| 2b | `PacedTapRun` — collects taps against a schedule; per-pad debounce; window opens one match-window before beat 0, closes `trialGraceMs` after the last | `core/src/domain/blocks/paced-tap.ts` |
| 3 | Landscape lock (`sensorLandscape`) | `AndroidManifest.xml` |
| 4 | `TurningTable` — angle is `beatPositionAt(clock())` every frame, **not** an animation timer; clock injected | `app/src/ui/TurningTable.tsx` |
| 5 | Kettle flash on the beat, clock-driven fade; table stops at the last cup. **Protocol v1.2.0** adds `cue.cupsOnTable` (8) and `cue.visualFlashMs` (150), PILOT | same + `protocol.ts` |
| 6 | Pad wired to the run; one-directional feedback (bloom on near-beat, nothing on miss), "near" decided by the same matcher | `app/src/screens/PacedTapScreen.tsx` |
| 7 | Dev results table with per-reason rejection breakdown | same |
| 8 | Dev menu in `App.tsx`; shared controls extracted to `app/src/ui/controls.tsx` | |

**Placeholders, loud in `PacedTapScreen.tsx`, not protocol values:** tempo 700 ms (C2's job),
16 beats per trial (undesigned), side = right (session-level decision, undesigned).

**Not modelled yet, deliberately:** hidden/phantom beats (R4), side patterns (R2/R3), whether
a tap on the wrong pad matches. `Beat.side` and `PacedTap.side` are recorded as facts;
matching is time-only.

**User's first R1 run** (visual cue only, debug build): 16/16 hit, mean −6 ms, SD 48 ms,
1 rejected, jitter 4.1 ms. The SD is about double what an auditory cue is expected to give
— consistent with the visual-vs-auditory synchronisation literature. That gap is what M9 is for.

**Test count: 142 core (vitest) + 4 app (jest) = 146.** All green at last run.

### 16 Sep — M9 audio, S1: hello click + readout

The sound plan (S1–S5, then backing music as S6) is in §11. Decisions: `AudioTrack` from Kotlin
rather than Oboe (same path on this device, no MMAP; escalate only if needed); the beat click is
synthesised in code from protocol values; backing music will be sample-pack *hits* placed on
the grid by a renderer at the participant's tempo, never pre-recorded loops.

Built:
- `app/src/specs/NativeAudioEngine.ts` — TurboModule contract; codegen generates the Kotlin base
  class (`package.json` → `codegenConfig`).
- `app/android/.../audio/AudioEngineModule.kt` — `playClick(hz, ms)`: renders 1 s mono PCM with
  the click at 200 ms, opens a static low-latency track at the native rate, plays, polls
  `getTimestamp()` 30× at 20 ms, returns a readout. Click parameters are *arguments*, so the
  stimulus stays defined in the protocol, not in Kotlin.
- `KopitiamPackage.kt` — registers the app's own modules; `MainApplication.kt` adds it.
- `packages/core/src/analysis/clock-map.ts` — `fitClockMap(anchors)`: centred least squares of
  nanoTime on frame position → ns/frame, intercept, implied sample rate, residual SD. Tests
  include the 44.1-vs-48 kHz trap and that the rate estimate tightens with anchor span.
- `AudioCheckScreen.tsx` — dev screen; "Sound check" on the menu.
- `jest.setup.js` — mocks the native module so `<App />` mounts in Jest.
- **Protocol v1.3.0**: `cue.clickHz` (1000) and `cue.clickMs` (30), PILOT.

Readout on the tablet: see §5. Pass.

**Test count: 151 core + 4 app = 155.**

### 17–18 Sep — S2–S4 audio, M4 (C2), and R4 the power cut

Audio S2 (`4690930`): one `play()` per trial; every click pre-rendered into one buffer at
`round((leadIn + k × ioi) × rate)`; playback and polling on their own thread; `startClickTrack`
resolves ~120 ms after play with the click frames and warm-up anchors, `finishClickTrack` at
the end. S3 (`13aacfa`): `fitClockOffset` — slope fixed at the sample rate, offset from the
warm-up anchors; free-slope `fitClockMap` kept as the watchdog. S4 (`6050c06`): the schedule's
start comes from the audio; scoring no longer touches the provisional JS clock at all. Lead-in
became 2 beats (v1.4.0). C2 (`5c6dc53`): natural tempo, clamped, locked, used by R1 (v1.5.0).

**R4 (this commit).** `Beat.cued`; `buildBeatSchedule({ cuedBeats })`; `summariseContinuation`
(continuation CV, synchronisation CV, cue dependence, tempo drift ratio, asynchrony drift);
the click track takes `cuedBeats` and `trailingClicks` — the blackout is zeros in the same
buffer; `TurningTable` goes dark after the last cued flash and reveals at the first trailing
click; `PacedTapScreen` takes a `blackout` config (`measurementBlackout()` from the protocol);
in the dark every accepted tap blooms, because a near-beat-only bloom would be a cue by
another route. Results screen scrolls. Audio engine has `Log.i` tracing under tag
`KopitiamAudio`, and the JS side times out the start after 5 s instead of waiting forever.

**User's first R4 run** (700 ms placeholder tempo, 8 cued + 35 phantom): 32 continuation taps;
continuation CV **5.1%**; tempo drift **+9.4% (slowing)**; synchronisation CV 11.0% (only 7
intervals, first tap +103 ms late — the first-beat problem again); per-beat asynchronies show
the drift sawtooth (taps re-assigned to the next beat once more than half a beat behind).

**Known limits recorded from that run:** (1) the overall asynchrony SD and "beats hit" rows are
meaningless for R4 once drift exceeds half a beat — hide or relabel them for R4; the
asynchrony-slope drift measure fails the same way, the tempo ratio is the robust one, and M13
detrends before computing variability anyway. (2) The first beat remains unpredictable; the
user rejected a count-in; BAASTA simply discards the first taps, which M13 will do.

**Test count: 186 core + 4 app = 190.**

---

## 4. Environment

| | |
|---|---|
| Machine | Windows 11 Home, single drive C:, ~25 GB free |
| Repo | `C:\src\fyp` — **not** the OneDrive folder (which is empty; the old session's cwd was stuck there but all work is in C:\src\fyp) |
| Node / npm | 24.14.0 / 11.9.0 |
| JDK | Temurin 17.0.20.1 at `C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot` |
| Android SDK | `C:\Android\Sdk`: platform-tools, `platforms;android-37.0`, `build-tools;37.0.0`, `ndk;27.1.12297006`, `cmake;3.22.1` |
| Env vars (User) | `JAVA_HOME`, `ANDROID_HOME`, `ANDROID_SDK_ROOT`; PATH has platform-tools, cmdline-tools/latest/bin, emulator, and the stale `C:\src\flutter\bin` |
| Not installed | Android Studio (deliberately — cmdline tools only), `gh`, emulator images |
| Flutter | Installed at `C:\src\flutter` but unused. Deletable. |

**Gotchas met during setup:**
- **A screen whose content overflows the viewport breaks native view mounting on this React
  Native build (0.87.1, Fabric).** Found 18 Sep, cost an hour. Symptom: the JS side transitions
  normally (state, effects, audio all run) but the display freezes on the previous screen;
  logcat shows `SurfaceMountingManager:MissingViewState … Unable to find viewState for tag
  [N] for removeViewAt/addViewAt`, repeated every frame. Trigger was six 72 dp buttons in one
  column on the dev menu (taller than 601 dp); a later, unrelated screen then failed to draw.
  Bisected by file, confirmed by making the menu fit (two columns). **Rule: every screen fits
  the viewport or scrolls (`ScrollView`).** Results tables scroll. View culling and view
  recycling are off by default in this build, so it is not those flags.
- Android platforms now have minor versions: `platforms;android-37` does not exist, use
  `android-37.0`. RN's `compileSdkVersion = 37` resolved against it fine.
- `sdkmanager --licenses` cannot be fed via pipe in this shell (stdin is null). Worked with a
  `.bat` file using `< yes.txt` redirection, plus pre-written licence hash files in
  `C:\Android\Sdk\licenses\`.
- First Gradle build took 7m 23s. Subsequent are faster. One deprecation warning (Gradle 10)
  — leave it; the toolchain is pinned until data collection ends.
- 9 high npm advisories, all in Metro (build tooling, not shipped). Revisit before data
  collection, do not `npm audit fix --force`.
- PowerShell here-strings do not pipe into `git commit -F -`; write the message to a file.
- `adb` commands print progress to stderr, which PowerShell wraps as NativeCommandError.
  Harmless — check the actual output.
- Large Bash heredocs with mixed unicode/quotes can fail at the tool boundary; the Write
  tool is the reliable fallback for big markdown files.

---

## 5. The tablet — everything measured

**Samsung Galaxy Tab A7 Lite, SM-T220, Android 14 (API 34), serial `R9JT1089PYN`.**
MediaTek Helio P22T. The user owns it; whether it becomes the *study* device is undecided.

| Property | Value | Implication |
|---|---|---|
| Display | 800×1340, **60 Hz only**, 213 dpi | ~1006×601 dp landscape. Two pads at 48% ≈ 480 dp ≈ 8 cm each — generous, not tight |
| Audio sample rate | **48 kHz** | Good — no 44.1 kHz surprise |
| Audio HAL buffer | 1024 frames = **21.3 ms** | Large. Expect tens of ms output latency. Constant, so calibratable |
| Fast-track mixer | present (`availMask=0xfe`) | A low-latency path exists at AudioFlinger level |
| `android.hardware.audio.low_latency` | **not declared** | Concerning |
| `android.hardware.audio.pro` | not declared | |
| `aaudio.mmap_policy` property | **absent** | Strongest hint that Oboe may not get an exclusive MMAP stream at M9 → `getTimestamp` may be unavailable → degradation path (variability endpoints OK, calibrated asynchrony not) |
| **3.5 mm headphone jack** | **present** (`mt-snd-card Headset Jack`) | Excellent for M10: electrical loopback test possible without USB adapter |
| **Audio from inside the app** (S1, 16 Sep, `AudioTrack` + `PERFORMANCE_MODE_LOW_LATENCY`) | Advertised 48 kHz / **256 frames (5.3 ms)**; granted 48 kHz; performance mode **low-latency granted** despite the feature flag being absent; 0 underruns; `getTimestamp()` 27/30 reads (first 3 fail before output, normal); implied rate **47999.6 Hz**; clock-fit residual SD **0.012 ms**; uptime − nanoTime = −0.80 ms (same clock; uptime is truncated to ms) | **The audio path is good.** Fast mixer granted, timestamps stable to ~10 µs, clock runs true, same clock base as touch. Resolves the biggest tablet unknown. `AudioTrack` suffices; Oboe not needed. Still unknown: the constant output latency (frame → speaker), which is M10's loopback |
| Touch panel | `/dev/input/event7` "mtk-tpd" | Owned `system:input` 660 — shell cannot read raw events |
| Touch scan rate | **~120 Hz** (8.3 ms period; two drags, 18 intervals, via `dumpsys input` RecentQueue — §1) | Tap quantisation ≤8 ms, uniform → ~2.4 ms SD on a raw tap, ~3.4 ms on an interval. Small next to a 25–35 ms behavioural SD. **Caveat:** 18 intervals from finger drags; whether the panel ever idles to a lower rate, and the rate under a *tap* rather than a drag, are confirmed by V5 at M8 |

**Delivery jitter** (SD of touch-to-JS delay, measured by the app): **4.4 ms** and **3.8 ms**
across two debug-build runs; **1.1 ms** on a release build (§1). Stable within a build type. Interval noise contribution √2×3.8 ≈ 5.4 ms → ~2–3% inflation of a
25–35 ms SD *if* it reached the data, and it mostly does not because taps use kernel timestamps.
**Conclusion drawn: M8's native hook is worth building for defensibility (you cannot report what
you cannot measure) more than for magnitude.**

---

## 6. The user's own C1 results

| | Run 1 (before fix) | Run 2 (after fix) | Run 3 (release build, 16 Sep) |
|---|---|---|---|
| Taps | 61 | 68 | 68 |
| Rate | 6.1/s | 6.8/s | 6.8/s |
| Mean gap | 150 ms | 148 ms | 148 ms |
| SD | 25.4 ms | 15.7 ms | 12.3 ms |
| CV | 16.9% | 10.6% | 8.3% |
| Debounced | 1 | 0 | — |
| Jitter | 4.4 ms | 3.8 ms | 1.1 ms |

Run 3's rate and mean gap are identical to run 2 — the user's sustained rate is stable at
~6.8/s. The further SD drop (15.7 → 12.3) is again **not attributable**: practice and the lower
release-build jitter changed together.

Run 2's rate matches the sustained rate (1000/148 = 6.76/s) — the fix worked. The SD drop is
**not** cleanly attributable: practice, the fix, and the absence of a dropped tap all changed at
once. A single debounced genuine tap creates a ~300 ms interval which alone adds ~20 ms to an
SD — there is **no outlier handling until M13**, so current SDs are fragile.

6.8/s and CV 10.6% are healthy young-adult figures. Older adults will be slower and more variable.

---

## 7. Decisions and why

| Decision | Choice | Why |
|---|---|---|
| Framework | React Native | User fluency. Both stacks need identical native timing code; scored taps bypass the framework anyway |
| Platform order | Android now, iOS Dec | iOS needs a Mac (Xcode). **User has not confirmed Mac access.** If none, the study is Android-only |
| Test device now | User's own A7 Lite | Fine for M3–M7. Must be *qualified* at M8–M10 before the fleet is bought. Use one model for the whole trial |
| Laterality | Two kettles, left and right, pad under each | Simon/mirror manipulation needs left/right in both stimulus and response |
| Teh tarik (hold/release) | Training trials only | Mixed hold/tap intervals break the single-series analysis that continuation CV and Wing–Kristofferson need |
| R4 blackout | Power cut: lights out, audio off, table keeps turning unseen, reveal on lights-up | The turning table is itself a pacing cue; it must be invisible or the cue was never withdrawn |
| Measurement vs training | Fixed identical protocol for both arms at baseline/post-test; `session_kind` selects policy, never `arm` | Arm B never experiences blackout in training; without this the arms are measured on different tasks |
| Patterns | Isochronous grid, random L/R sides | Required for W-K validity and for CV-of-ITI to mean anything |
| Persistence | On-device SQLite + CSV | No network, simple ethics story |
| Web app? | Rejected (twice) | Cannot calibrate latency, cannot guarantee unprocessed mic (kills V1's click-leakage design), browser storage can be evicted, no kiosk mode |
| RHRE (GitHub remix editor)? | Rejected | Desktop-only JVM, archived 2023, GPL-3, ships Nintendo assets |

---

## 8. M2 was deliberately deferred

The plan had M2 = ports (`Clock`, `TapSource`, etc.) + fakes + `SyntheticTapper`. The user
asked "why aren't we building the app yet?" and the honest answer was that M2's payoff is at
M13 (testing the analysis against known-variance synthetic data), not before. So M3 was built
directly, with `SpeedTapRun` taking time as an argument instead of via a `Clock` port. **The
port abstractions and the synthetic tapper still need to be built — probably at M5 (when the
`Block` interface is extracted) or just before M13.**

---

## 9. Open questions for the supervisor

1. **Continuation window length.** At the slowest tempo (900 ms), a 25 s window gives exactly
   25 usable intervals against a W-K minimum of 25 — **zero margin**. A test in `protocol.test.ts`
   pins this coupling. Options: lengthen the window, lower the tempo ceiling, or accept W-K will
   be missing for the slowest participants.
2. **Mac access** for the December iOS build.
3. **Is the A7 Lite the study device?** Qualify one before buying thirty.
4. Personalised vs fixed cue-fading thresholds; W-K invalid-fit handling (floor vs drop);
   allocation off-app vs on-device — all listed in `docs/PLAN.md`.

---

## 10. Known issues and debt

- **No GitHub remote.** User must create a private repo; then `git remote add origin ... && git push -u origin main`.
- **No outlier handling** — SDs fragile to a single dropped tap until M13.
- **touch-clock.ts is provisional** — single-sample offset; absolute delay meaningless. Replaced at M8.
- **Stale Flutter on PATH** — harmless, deletable.
- **App.tsx mounts one screen directly** — session runner arrives at M5.
- **No landscape lock yet** — tablet runs portrait. Plan calls for landscape.
- Metro advisories (see §4).

---

## 11. What is next

**As of 21 Sep.** Done: health check, R1, audio S1–S4, C2, R4. The measurement chain runs on
the tablet. Order of value now:

| Next | What | Size | Why |
|---|---|---|---|
| **1. M6 persistence** | Core: the saved shape of a trial (pure, tested). Then SQLite, one transaction per trial after it ends, never during play. Then a runs screen | 1.5 days | Every run is currently lost on exit |
| 2. M7 export | CSV per table + `protocol_v1.json`; open in R | half a day | Data must leave the tablet |
| 3. R4 results tidy | Hide overall asynchrony SD and hit count for R4 (meaningless under drift); keep the "in the dark" rows | 1 hour | Honest display |
| 4. M5 extract `Block` | Three concrete blocks now exist; pull out `Block`, `TrialRunner`, the ports + fakes + `SyntheticTapper` deferred from M2; a session runner with `session_kind` (measurement vs training) | 1 day | Before more blocks pile up |
| 5. M8 touch hook | `dispatchTouchEvent` → kernel timestamps, historical samples | 1–2 days | Defensible timing; proper scan-rate measurement |
| 6. Sound S5/S6 | Mic check of click isochrony (needs a mic); backing music from sample hits (needs packs; supervisor question on backing) | — | |
| 7. R2/R3, cue-fading ladder, V1 | The rest of the proposal | Oct | |
| 8. Art | Two generation prompts given (see §1); files to `docs/design/`; integrate into the kettle screen | when assets exist | |

Full sequence in `docs/PLAN.md`.

---

## 12. Corrections the previous session made to itself

So they are not repeated:

- Claimed the PCG32 golden test would be "only a regression lock" — wrong; it matches the
  official reference vector and is an external verification.
- Claimed the A7 Lite screen was "tight" for two pads — wrong; ~480 dp each is generous.
- Quoted a disk-free figure without measuring — corrected to the measured value.
- The first delivery-delay diagnostic reported a negative value (−21.7 ms) because the clock
  offset was learned from the button press, which travels a slower path than the raw pad.
  Replaced with the *spread* (SD), which survives the offset error and is the quantity that
  matters.
- Told the user "nothing will be affected" by delay — over-reassuring. Corrected: a *constant*
  delay cancels from interval measures; varying delay, dropped taps, wrong sample rate, audio
  dropouts and route changes do **not**, and most are unmeasured on this device.
