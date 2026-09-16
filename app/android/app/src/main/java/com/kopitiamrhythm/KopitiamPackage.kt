package com.kopitiamrhythm

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.kopitiamrhythm.audio.AudioEngineModule

/**
 * The app's own native modules. One place to look for everything that crosses
 * the JS–Kotlin boundary: the audio engine now, the touch hook at M8.
 */
class KopitiamPackage : BaseReactPackage() {

  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
    when (name) {
      AudioEngineModule.NAME -> AudioEngineModule(reactContext)
      else -> null
    }

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    mapOf(
      AudioEngineModule.NAME to
        ReactModuleInfo(
          name = AudioEngineModule.NAME,
          className = AudioEngineModule::class.java.name,
          canOverrideExistingModule = false,
          needsEagerInit = false,
          isCxxModule = false,
          isTurboModule = true,
        ),
    )
  }
}
