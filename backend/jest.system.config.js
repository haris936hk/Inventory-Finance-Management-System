module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/system/**/*.test.js',
    '**/system/**/*.spec.js'
  ],
  setupFilesAfterEnv: ['<rootDir>/system/setup.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
    '!src/config/database.js'
  ],
  coverageDirectory: 'coverage-system',
  coverageReporters: ['text', 'lcov', 'html'],
  // Use the same setup as integration tests for database
  globalSetup: '<rootDir>/integration/globalSetup.js',
  globalTeardown: '<rootDir>/integration/globalTeardown.js',
  // Extended timeout for system tests (complete workflows take longer)
  testTimeout: 60000,
  // Run tests sequentially to avoid resource conflicts during system testing
  maxWorkers: 1
};