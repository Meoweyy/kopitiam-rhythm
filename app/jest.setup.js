/**
 * Jest has no native side, so every TurboModule the app imports needs a
 * stand-in here. Keep each mock minimal: enough for the tree to mount. The
 * behaviour of the real module is verified on the device, not here.
 */

jest.mock('./src/specs/NativeAudioEngine', () => ({
  __esModule: true,
  default: {
    playClick: jest.fn(() => Promise.reject(new Error('no native audio in Jest'))),
  },
}));
