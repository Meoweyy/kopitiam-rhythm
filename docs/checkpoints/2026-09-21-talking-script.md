# Talking script — supervisor checkpoint, 21 Sep 2026

About 8–10 minutes if you do the demo. Bring the tablet charged, Metro is *not* needed for a
demo if the release build is installed; if the debug build is installed, the laptop must be
plugged in with Metro running. Check which one is on the tablet the night before.

Bold = the point to land. Indented = what to say if asked. [DEMO] = do it on the tablet.

---

## 1. Open (30 s)

"I want to show you where the build is, what I've measured on the tablet, and get your
decision on five things before I go further. The one-page summary is in the document."

**The headline: the primary-outcome chain works end to end on real hardware — natural tempo,
cued tapping, cue withdrawn, continuation scored. Nothing saves yet; that's the next step.**

---

## 2. The demo (3 min) [DEMO]

Do it in this order — it is the order the study runs in.

**C2 — natural tempo.** "First it measures the person's comfortable tapping rate. Ten seconds,
takes the median gap, clamps it to 500–900 ms. That becomes *their* tempo for the whole study."
Tap at a comfortable pace. Show the locked tempo on the result screen.

**R1 — cued tapping (the kettle).** "Now the game. A table of cups turns; when a cup reaches the
kettle there's a click and a flash. Tap on the beat. The table is driven off the same clock the
taps are stamped with — it's not an animation, so the picture can't drift from the sound."
Play one trial. Point at the result: mean asynchrony, SD.

**R4 — the power cut.** "This is the primary outcome. Eight cued beats, then the lights go out
and the sound stops. The beat keeps falling — you just can't see or hear it — and they keep
tapping for 25 seconds. At the end three clicks tell them it's over."
Play one trial. Point at: **continuation CV** ("that's the number the whole study is about"),
cue dependence, drift.

> If she asks why lights-out and not just silence: "The turning table is itself a pacing cue.
> If it stayed visible, the cue was never withdrawn."

> If she asks about the first tap being late: "Known problem — the first beat is always
> unpredictable. BAASTA discards the first taps; so will the analysis."

---

## 3. What I measured on the tablet (2 min)

**"Because a timing bug found after data collection can't be fixed, I characterised the tablet
before building further."**

Three numbers, in plain terms:

- **Touch: ~120 Hz.** "A tap is timed to within 8 ms. That's about 2 ms of noise against
  behavioural variability of 25–35 ms. Small."
- **Audio: the clock is stable to about a hundredth of a millisecond, and it's the same clock
  the touches are stamped with.** "So beat times and tap times are on one clock — no
  cross-clock correction."
- **Speaker output is as regular as the buffer.** "I recorded the tablet playing its own clicks
  through its mic: every gap was 700.000 ms. And the mic can hear the click clearly through
  someone chanting over it — which is what the vocal block's alignment method needs."

**What I haven't measured:** "The absolute speaker latency — the loopback test. But a constant
latency cancels out of every interval measure; it only matters for absolute asynchrony, and it
gets calibrated per tablet."

> If she asks about React Native / the framework: "Scored taps don't come from the framework.
> They come from the kernel's touch timestamp. The framework only draws."

---

## 4. Decisions I've made that change the proposal (1 min)

Say these as *decisions*, invite objection.

1. **"Measurement sessions use a fixed eight cued beats, not a random cut-off."** Knowing when the
   cue stops doesn't help you keep time; a varying cued count would confound the outcome.
2. **"Cue-fading = the cue stops sooner. Not sound-off-then-picture-off."** The cue is identical
   at every rung; only how long it lasts changes. Visual-only sync is twice as variable as
   auditory, so removing a channel changes the task rather than fading it.
3. **"Mirror mode and pattern length are difficulty tiers in both arms."** The only difference
   between arms is the cue schedule. Otherwise an arm difference can't be attributed.
4. **"No count-in."** Two beats of visible approach instead.

---

## 5. The five questions (2 min) — get an answer to each

1. **Training tempo — fixed per person, or varied between sets?** "BAASTA and Rhythm Workers
   both vary it. Measurement sessions stay locked either way. Your call."
2. **Continuation window.** "At 900 ms, 25 seconds gives exactly 25 intervals — the
   Wing–Kristofferson minimum with zero margin. Lengthen the window, cap the tempo lower, or
   accept W–K missing for the slowest people?"
3. **Is the A7 Lite the study device?** "It passes. One model for the whole trial; I need to know
   before a fleet is bought."
4. **Add BAASTA's anisochrony-detection listening test?** "A perceptual timing test with no motor
   component. It would tell us whether a training effect is in perception or production."
5. **iOS.** "Needs a Mac. If there isn't one, the study is Android-only. OK?"

Write her answers down in the meeting. Each one changes a protocol constant or a build decision.

---

## 6. Close (30 s)

"Next is persistence — every trial saved on the tablet, exportable as CSV. Then the session
structure, then the remaining blocks in October, the vocal block in November, pilots
November–December. On the proposal timeline."

**Ask: "Anything you'd want to see at the next checkpoint that isn't on that list?"**

---

## Things NOT to claim

- Don't say the tablet is "validated" or "qualified" for the study. Say *characterised*, and
  that the loopback latency test is still to come.
- Don't quote your own CV numbers as evidence of anything except that the pipeline works.
  n = 1, you, development device.
- Don't say the mic test was a proper test. One recording, third-party recorder app. It says
  the method is *viable*, not proven.
- Don't promise iOS.
