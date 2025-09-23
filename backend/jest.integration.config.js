module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/integration/**/*.test.js',
    '**/integration/**/*.spec.js'
  ],
  setupFilesAfterEnv: ['<rootDir>/integration/setup.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
    '!src/config/database.js'
  ],
  coverageDirectory: 'coverage-integration',
  coverageReporters: ['text', 'lcov', 'html'],
  // Use a different test database for integration tests
  globalSetup: '<rootDir>/integration/globalSetup.js',
  globalTeardown: '<rootDir>/integration/globalTeardown.js',
  // Longer timeout for integration tests
  testTimeout: 30000
};