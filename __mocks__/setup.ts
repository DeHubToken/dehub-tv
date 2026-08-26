/**
 * Test setup.
 *
 * AsyncStorage is a native module, so under Jest it resolves to null and every
 * import of `lib/session` throws before a single assertion runs. The package
 * ships an in-memory mock for exactly this; using it means the session tests
 * exercise the real read/write logic rather than a hand-rolled stand-in.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
