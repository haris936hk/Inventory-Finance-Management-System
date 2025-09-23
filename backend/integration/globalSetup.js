// Global setup for integration tests
module.exports = async () => {
  console.log('🚀 Setting up integration test environment...');

  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret-for-integration-tests';

  // Use test database URL if available, otherwise use main database
  if (!process.env.TEST_DATABASE_URL && !process.env.DATABASE_URL) {
    console.warn('⚠️  No TEST_DATABASE_URL or DATABASE_URL found. Tests may fail.');
  }

  console.log('✅ Integration test environment ready');
};