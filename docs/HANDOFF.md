# Handoff — where the previous session stopped and everything it learned

Written 16 Sep 2026 at the end of a session that ran 8–10 Sep. This is the complete context a
new session needs. `CLAUDE.md` is the short version; `docs/PLAN.md` is the milestone plan.

---

## 1. Where we stopped — read this first

**Mid-way through a "health check" the user asked for** before building further. The idea:
check early for the silent failures that would otherwise surface late in production.

The check had five parts. Status:

| # | Check | Status |
|---|---|---|
| 1 | Touch scan rate of the tablet's digitiser | **BLOCKED — see below** |
| 2 | Whether the tablet supports low-latency audio | **Done** — it does not declare it (§5) |
| 3 | Does a release APK work standalone (no Metro)? | **Not started** |
| 4 | Does the app survive backgrounding / screen-off mid-run? | **Not started** |
| 5 | Full test suite + typecheck | Was green at last run (92 tests) |

**Why #1 is blocked.** The obvious method — `adb shell getevent -t /dev/input/event7` —
returns nothing. The touch device is `crw-rw---- system:input` and the `shell` user cannot read
it; the tablet is not rooted. A synthetic `input swipe` would not measure real hardware anyway.

**The right method, not yet done:** measure it *from inside the app*. Capture
`nativeEvent.timestamp` on touch **move** events during a finger drag; the most common
inter-event interval is the scan period. Needs no root, and it is what M8's validation suite
would do anyway. A small diagnostic screen or a dev-only mode on `SpeedTapScreen` would do it.

**The very last command** (checking `adb shell id` and `dumpsys input`) failed with a tool
permission error before it ran — nothing was learned from it.

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
- **16 Sep** — This handoff.

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

**Test count: 89 core (vitest) + 3 app (jest) = 92.** All green at last run.

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
| Touch panel | `/dev/input/event7` "mtk-tpd" | Owned `system:input` 660 — shell cannot read raw events |
| Touch scan rate | **UNMEASURED** | The single most important unknown. Measure in-app (§1) |

**Delivery jitter** (SD of touch-to-JS delay, measured by the app): **4.4 ms** and **3.8 ms**
across two runs. Stable. Interval noise contribution √2×3.8 ≈ 5.4 ms → ~2–3% inflation of a
25–35 ms SD *if* it reached the data, and it mostly does not because taps use kernel timestamps.
**Conclusion drawn: M8's native hook is worth building for defensibility (you cannot report what
you cannot measure) more than for magnitude.**

---

## 6. The user's own C1 results

| | Run 1 (before fix) | Run 2 (after fix) |
|---|---|---|
| Taps | 61 | 68 |
| Rate | 6.1/s | 6.8/s |
| Mean gap | 150 ms | 148 ms |
| SD | 25.4 ms | 15.7 ms |
| CV | 16.9% | 10.6% |
| Debounced | 1 | 0 |
| Jitter | 4.4 ms | 3.8 ms |

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
- **Touch scan rate unmeasured** (§1).
- **No outlier handling** — SDs fragile to a single dropped tap until M13.
- **touch-clock.ts is provisional** — single-sample offset; absolute delay meaningless. Replaced at M8.
- **Stale Flutter on PATH** — harmless, deletable.
- **App.tsx mounts one screen directly** — session runner arrives at M5.
- **No landscape lock yet** — tablet runs portrait. Plan calls for landscape.
- Metro advisories (see §4).

---

## 11. What is next

**Immediate:** finish the health check (§1) — especially the in-app touch scan rate, and a
standalone release build (`cd app/android && ./gradlew assembleRelease`, install, run with
Metro *stopped*).

**Then M4 — C2 natural tempo.** Ten seconds tapping at a comfortable pace. Median ITI clamped
to 500–900 ms, **locked at session 1 and never recomputed**. Every later block runs at it.
Reuses C1's structure almost entirely. ~half a day.

**Then M5 — extract `Block`.** Now that C1 and C2 both exist. Also the right moment to build
the deferred ports + fakes + `SyntheticTapper` from M2.

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
