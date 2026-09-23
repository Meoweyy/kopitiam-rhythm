module.exports = {
  root: true,
  extends: '@react-native',
  overrides: [
    {
      // Jest's globals (`jest`, `test`, `expect`) exist only in the test
      // environment, so ESLint has to be told which files run there.
      files: ['jest.setup.js', '__tests__/**/*'],
      env: {jest: true},
    },
  ],
  rules: {
    // `void somePromise` is this codebase's deliberate marker for a promise
    // that is intentionally not awaited — starting the audio track, stopping
    // it on unmount. Without it those calls look like forgotten `await`s.
    'no-void': 'off',
  },
};
