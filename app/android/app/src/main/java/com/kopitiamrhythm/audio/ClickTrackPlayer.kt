package com.kopitiamrhythm.audio

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTimestamp
import android.media.AudioTrack
import android.os.SystemClock
import kotlin.math.roundToInt
import kotlin.math.roundToLong

/** One `getTimestamp()` read. */
data class Anchor(val framePosition: Long, val nanoTime: Long)

/** What to render. Mirrors `ClickTrackSpec` on the JS side. */
data class ClickTrackSpec(
  val ioiMs: Double,
  val beatCount: Int,
  val leadInMs: Double,
  val tailMs: Double,
  val clickHz: Double,
  val clickMs: Double,
)

class ClickTrackStart(
  val sampleRate: Int,
  val totalFrames: Int,
  val clickFrames: IntArray,
  val performanceMode: Int,
  val playCalledAtNanos: Long,
  val anchors: List<Anchor>,
)

class ClickTrackEnd(val anchors: List<Anchor>, val underrunCount: Int, val stopped: Boolean)

/**
 * Plays one trial's click track and collects timestamps throughout.
 *
 * ## One `play()` per trial
 *
 * Every click is written into a single buffer before playback starts: click k
 * at frame `round((leadIn + k × ioi) / 1000 × rate)`, one multiplication from
 * the anchor. Then one `play()`. There is no per-click scheduling, so there is
 * nothing to jitter: the spacing of the clicks is exactly the spacing of the
 * samples, and the only question — answered by the timestamps — is when the
 * whole buffer started.
 *
 * ## Threading
 *
 * Playback and polling run on a dedicated thread. `start()` returns once a
 * few valid timestamps have landed, so the caller can fit a clock map while
 * the lead-in is still playing; `awaitEnd()` blocks until the track is done.
 * Neither blocks the React Native module thread for the trial's duration.
 */
class ClickTrackPlayer(private val sampleRate: Int, private val spec: ClickTrackSpec) {

  private val lock = Object()
  private val anchors = ArrayList<Anchor>()
  @Volatile private var stopRequested = false
  @Volatile private var finished = false
  private var end: ClickTrackEnd? = null
  private var track: AudioTrack? = null

  val clickFrames: IntArray =
    IntArray(spec.beatCount) { k ->
      ((spec.leadInMs + k * spec.ioiMs) / 1000.0 * sampleRate).roundToLong().toInt()
    }
  val totalFrames: Int =
    ((spec.leadInMs + (spec.beatCount - 1) * spec.ioiMs + spec.clickMs + spec.tailMs) /
        1000.0 * sampleRate)
      .roundToInt()

  /** Renders, starts playback, and returns after `warmupAnchors` valid reads or `warmupTimeoutMs`. */
  fun start(warmupAnchors: Int = 5, warmupTimeoutMs: Long = 600): ClickTrackStart {
    val pcm = ShortArray(totalFrames)
    for (frame in clickFrames) ClickSynth.render(pcm, frame, sampleRate, spec.clickHz, spec.clickMs)

    val built =
      AudioTrack.Builder()
        .setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_GAME)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build(),
        )
        .setAudioFormat(
          AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setSampleRate(sampleRate)
            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
            .build(),
        )
        .setBufferSizeInBytes(totalFrames * 2)
        .setTransferMode(AudioTrack.MODE_STATIC)
        .setPerformanceMode(AudioTrack.PERFORMANCE_MODE_LOW_LATENCY)
        .build()
    track = built

    val written = built.write(pcm, 0, totalFrames)
    check(written == totalFrames) { "wrote $written of $totalFrames frames" }

    val playCalledAtNanos = System.nanoTime()
    built.play()

    Thread(::pollUntilDone, "click-track-poll").start()

    // Wait for the first few anchors so the caller can fit a map immediately.
    val deadline = SystemClock.uptimeMillis() + warmupTimeoutMs
    synchronized(lock) {
      while (anchors.size < warmupAnchors && !finished) {
        val remaining = deadline - SystemClock.uptimeMillis()
        if (remaining <= 0) break
        // `wait(0)` would wait forever; `remaining` is strictly positive here.
        lock.wait(remaining)
      }
      return ClickTrackStart(
        sampleRate = sampleRate,
        totalFrames = totalFrames,
        clickFrames = clickFrames,
        performanceMode = built.performanceMode,
        playCalledAtNanos = playCalledAtNanos,
        anchors = ArrayList(anchors),
      )
    }
  }

  fun stop() {
    stopRequested = true
  }

  /** Blocks until playback has ended, then returns everything collected. */
  fun awaitEnd(): ClickTrackEnd {
    synchronized(lock) {
      while (!finished) lock.wait()
      return end!!
    }
  }

  private fun pollUntilDone() {
    val built = track ?: return
    val stamp = AudioTimestamp()
    val expectedMs = (totalFrames.toDouble() / sampleRate * 1000).roundToLong()
    val hardDeadline = SystemClock.uptimeMillis() + expectedMs + 1000
    var lastFrame = -1L

    while (!stopRequested && SystemClock.uptimeMillis() < hardDeadline) {
      if (built.getTimestamp(stamp)) {
        // The HAL can report the same position twice between mixer periods;
        // a repeated anchor carries no new information and would weight the fit.
        if (stamp.framePosition != lastFrame) {
          lastFrame = stamp.framePosition
          synchronized(lock) {
            anchors.add(Anchor(stamp.framePosition, stamp.nanoTime))
            lock.notifyAll()
          }
        }
        if (stamp.framePosition >= totalFrames) break
      }
      try {
        Thread.sleep(POLL_INTERVAL_MS)
      } catch (_: InterruptedException) {
        break
      }
    }

    val underruns = built.underrunCount
    try {
      built.stop()
    } catch (_: IllegalStateException) {}
    built.release()
    track = null

    synchronized(lock) {
      end = ClickTrackEnd(ArrayList(anchors), underruns, stopRequested)
      finished = true
      lock.notifyAll()
    }
  }

  companion object {
    const val POLL_INTERVAL_MS = 20L
  }
}
