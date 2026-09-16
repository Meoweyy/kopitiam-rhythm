package com.kopitiamrhythm.audio

import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTimestamp
import android.media.AudioTrack
import android.os.Build
import android.os.SystemClock
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableArray
import com.kopitiamrhythm.specs.NativeAudioEngineSpec

/**
 * The native audio engine. S1: one click, and a report of what the device gave us.
 *
 * ## Why `AudioTrack` and not Oboe, for now
 *
 * Oboe's advantage is the exclusive MMAP path, which this tablet does not
 * advertise (`aaudio.mmap_policy` is unset). Without it, Oboe and AudioTrack
 * land on the same AudioFlinger path, and AudioTrack gives the two things the
 * study needs directly: `getTimestamp()`, which says which frame was at the
 * output at which `System.nanoTime()`, and a readout of the granted stream.
 * If this readout shows the path cannot deliver, Oboe is the escalation.
 *
 * ## Why the click parameters are arguments
 *
 * The stimulus is defined on the JS side, in the protocol, so it is versioned
 * and snapshot-locked there. Kotlin renders what it is told; it does not own
 * any study constant.
 *
 * ## Clock bases
 *
 * `AudioTimestamp.nanoTime` is `System.nanoTime()` (CLOCK_MONOTONIC). Touch
 * events carry `MotionEvent.getEventTime()`, which is `SystemClock.uptimeMillis()`
 * — also CLOCK_MONOTONIC, in milliseconds. The readout includes their
 * difference at `play()` so the identity is checked on every run rather than
 * assumed.
 */
class AudioEngineModule(reactContext: ReactApplicationContext) :
  NativeAudioEngineSpec(reactContext) {

  /** The trial currently playing, if any. One at a time, by design. */
  @Volatile private var current: ClickTrackPlayer? = null

  override fun getName(): String = NAME

  private fun requireApi26(promise: Promise): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      promise.reject("unsupported", "Audio engine needs Android 8 (API 26) or newer")
      return false
    }
    return true
  }

  private fun nativeSampleRate(): Int {
    val audioManager = reactApplicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    return audioManager.getProperty(AudioManager.PROPERTY_OUTPUT_SAMPLE_RATE)?.toIntOrNull() ?: 48_000
  }

  // ---- S2: the trial-length click track ------------------------------------

  override fun startClickTrack(spec: ReadableMap, promise: Promise) {
    if (!requireApi26(promise)) return
    if (current != null) {
      promise.reject("busy", "a click track is already playing")
      return
    }
    val parsed =
      ClickTrackSpec(
        ioiMs = spec.getDouble("ioiMs"),
        beatCount = spec.getInt("beatCount"),
        leadInMs = spec.getDouble("leadInMs"),
        tailMs = spec.getDouble("tailMs"),
        clickHz = spec.getDouble("clickHz"),
        clickMs = spec.getDouble("clickMs"),
      )
    val player = ClickTrackPlayer(nativeSampleRate(), parsed)
    current = player

    // `start()` blocks for the warm-up; keep that off the module thread.
    Thread({
      try {
        val started = player.start()
        val result = Arguments.createMap()
        result.putInt("sampleRate", started.sampleRate)
        result.putInt("totalFrames", started.totalFrames)
        val frames = Arguments.createArray()
        for (f in started.clickFrames) frames.pushInt(f)
        result.putArray("clickFrames", frames)
        result.putString("performanceMode", describePerformanceMode(started.performanceMode))
        result.putDouble("playCalledAtMs", started.playCalledAtNanos / 1e6)
        result.putArray("anchors", anchorsToArray(started.anchors))
        promise.resolve(result)
      } catch (error: Exception) {
        current = null
        promise.reject("audio", error)
      }
    }, "click-track-start").start()
  }

  override fun finishClickTrack(promise: Promise) {
    val player = current
    if (player == null) {
      promise.reject("none", "no click track was started")
      return
    }
    Thread({
      try {
        val end = player.awaitEnd()
        val result = Arguments.createMap()
        result.putArray("anchors", anchorsToArray(end.anchors))
        result.putInt("underrunCount", end.underrunCount)
        result.putBoolean("stopped", end.stopped)
        promise.resolve(result)
      } catch (error: Exception) {
        promise.reject("audio", error)
      } finally {
        if (current === player) current = null
      }
    }, "click-track-finish").start()
  }

  override fun stopClickTrack(promise: Promise) {
    current?.stop()
    promise.resolve(null)
  }

  private fun anchorsToArray(anchors: List<Anchor>): WritableArray {
    val array = Arguments.createArray()
    for (a in anchors) {
      val m = Arguments.createMap()
      m.putDouble("framePosition", a.framePosition.toDouble())
      m.putDouble("nanoTime", a.nanoTime.toDouble())
      array.pushMap(m)
    }
    return array
  }

  // ---- S1: one click and a readout -----------------------------------------

  override fun playClick(clickHz: Double, clickMs: Double, promise: Promise) {
    if (!requireApi26(promise)) return

    var track: AudioTrack? = null
    try {
      val context = reactApplicationContext
      val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      val packageManager = context.packageManager
      val readout = Arguments.createMap()

      // What the device says about itself.
      val nativeSampleRate =
        audioManager.getProperty(AudioManager.PROPERTY_OUTPUT_SAMPLE_RATE)?.toIntOrNull() ?: 48_000
      val nativeFramesPerBuffer =
        audioManager.getProperty(AudioManager.PROPERTY_OUTPUT_FRAMES_PER_BUFFER)?.toIntOrNull() ?: -1
      readout.putInt("nativeSampleRate", nativeSampleRate)
      readout.putInt("nativeFramesPerBuffer", nativeFramesPerBuffer)
      readout.putBoolean(
        "featureLowLatency",
        packageManager.hasSystemFeature(PackageManager.FEATURE_AUDIO_LOW_LATENCY),
      )
      readout.putBoolean("featurePro", packageManager.hasSystemFeature(PackageManager.FEATURE_AUDIO_PRO))

      // One second of mono PCM at the device's native rate, click at 200 ms.
      // Opening at the native rate avoids a resampler in the path; the readout
      // reports the granted rate so a mismatch cannot pass unnoticed.
      val sampleRate = nativeSampleRate
      val totalFrames = sampleRate
      val pcm = ShortArray(totalFrames)
      ClickSynth.render(pcm, startFrame = sampleRate / 5, sampleRate, clickHz, clickMs)

      val format =
        AudioFormat.Builder()
          .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
          .setSampleRate(sampleRate)
          .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
          .build()
      val attributes =
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_GAME)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
      track =
        AudioTrack.Builder()
          .setAudioAttributes(attributes)
          .setAudioFormat(format)
          .setBufferSizeInBytes(totalFrames * 2)
          .setTransferMode(AudioTrack.MODE_STATIC)
          .setPerformanceMode(AudioTrack.PERFORMANCE_MODE_LOW_LATENCY)
          .build()

      val framesWritten = track.write(pcm, 0, totalFrames)
      readout.putInt("framesWritten", framesWritten)
      readout.putInt("sampleRate", track.sampleRate)
      readout.putInt("bufferSizeInFrames", track.bufferSizeInFrames)
      readout.putString("performanceMode", describePerformanceMode(track.performanceMode))

      val playCalledAtNanos = System.nanoTime()
      val playCalledAtUptimeMs = SystemClock.uptimeMillis()
      track.play()

      // Poll timestamps while the second plays. Early polls commonly fail
      // before the track has reached the output; the count of successes is
      // itself part of the readout.
      val stamp = AudioTimestamp()
      val samples = Arguments.createArray()
      val polls = 30
      var reads = 0
      repeat(polls) {
        Thread.sleep(20)
        if (track.getTimestamp(stamp)) {
          reads += 1
          val sample = Arguments.createMap()
          sample.putDouble("framePosition", stamp.framePosition.toDouble())
          sample.putDouble("nanoTime", stamp.nanoTime.toDouble())
          samples.pushMap(sample)
        }
      }
      // Let the second finish before tearing down.
      Thread.sleep(450)

      readout.putInt("underrunCount", track.underrunCount)
      readout.putString("routedDevice", describeDevice(track))
      readout.putInt("timestampPolls", polls)
      readout.putInt("timestampReads", reads)
      readout.putArray("timestamps", samples)
      readout.putDouble("uptimeMinusNanoMs", playCalledAtUptimeMs - playCalledAtNanos / 1e6)
      readout.putDouble("playCalledAtMs", playCalledAtNanos / 1e6)

      promise.resolve(readout)
    } catch (error: Exception) {
      promise.reject("audio", error)
    } finally {
      track?.let {
        try {
          it.stop()
        } catch (_: IllegalStateException) {}
        it.release()
      }
    }
  }

  private fun describePerformanceMode(mode: Int): String =
    when (mode) {
      AudioTrack.PERFORMANCE_MODE_LOW_LATENCY -> "low-latency"
      AudioTrack.PERFORMANCE_MODE_POWER_SAVING -> "power-saving"
      AudioTrack.PERFORMANCE_MODE_NONE -> "none"
      else -> "unknown($mode)"
    }

  private fun describeDevice(track: AudioTrack): String {
    val device = track.routedDevice ?: return "unknown"
    val type =
      when (device.type) {
        android.media.AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "built-in speaker"
        android.media.AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> "wired headphones"
        android.media.AudioDeviceInfo.TYPE_WIRED_HEADSET -> "wired headset"
        android.media.AudioDeviceInfo.TYPE_BLUETOOTH_A2DP -> "bluetooth"
        android.media.AudioDeviceInfo.TYPE_USB_HEADSET -> "usb headset"
        else -> "type ${device.type}"
      }
    return "$type (${device.productName})"
  }

  companion object {
    const val NAME = "AudioEngine"
  }
}
