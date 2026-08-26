/**
 * The TV app's test setup.
 *
 * `jest-expo` rather than a bare node preset: most modules here reach
 * react-native even when the logic under test is pure — `lib/media.ts` needs
 * PixelRatio, the services reach expo-constants — and mocking that by hand is a
 * second, worse copy of what the preset already does.
 *
 * The transform ignore list is the usual React Native tax: these ship untranspiled
 * ES modules and Jest will not parse them without help.
 */
module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg))',
  ],
  setupFiles: ['<rootDir>/__mocks__/setup.ts'],
  testMatch: ['**/__tests__/**/*.test.ts?(x)'],
  collectCoverageFrom: ['lib/**/*.ts', 'services/**/*.ts', '!**/node_modules/**'],
};
