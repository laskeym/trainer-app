module.exports = {
  projects: [
    {
      displayName: 'components',
      preset: 'jest-expo',
      transformIgnorePatterns: [
        "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|standard-navigation)"
      ],
      setupFiles: ['<rootDir>/jest.setup.js'],
      testMatch: ['<rootDir>/__tests__/components/**/*.test.js'],
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      transform: {
        '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
      },
      testMatch: ['<rootDir>/__tests__/integration/**/*.test.js'],
    },
  ],
}