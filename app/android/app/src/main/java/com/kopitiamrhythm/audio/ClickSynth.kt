package com.kopitiamrhythm.audio

import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * Renders the beat click into a PCM buffer.
 *
 * A tone burst with a 1 ms linear attack and an exponential decay to the end
 * of `clickMs`. The fast attack gives the click a sharp, unambiguous onset —
 * the onset is the beat — and the decay keeps it from clicking again when it
 * stops. Frequency and duration are supplied by the caller: they are protocol
 * values on the JS side, and Kotlin owns no study constant.
 */
object ClickSynth {
  private const val AMPLITUDE = 0.8 * Short.MAX_VALUE
  private const val ATTACK_SECONDS = 0.001
  private const val DECAY_SHAPE = 5.0

  /** Writes one click starting at `startFrame`. Frames past the end of `pcm` are dropped. */
  fun render(pcm: ShortArray, startFrame: Int, sampleRate: Int, clickHz: Double, clickMs: Double) {
    val clickFrames = (clickMs / 1000.0 * sampleRate).roundToInt()
    val attackFrames = (ATTACK_SECONDS * sampleRate).roundToInt().coerceAtLeast(1)
    for (i in 0 until clickFrames) {
      val frame = startFrame + i
      if (frame < 0 || frame >= pcm.size) continue
      val t = i.toDouble() / sampleRate
      val attack = if (i < attackFrames) i.toDouble() / attackFrames else 1.0
      val decay = exp(-DECAY_SHAPE * i / clickFrames)
      pcm[frame] = (sin(2.0 * PI * clickHz * t) * attack * decay * AMPLITUDE).roundToInt().toShort()
    }
  }
}
