const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

// Import the actual app components
const authRoutes = require('../src/routes/authRoutes');
const inventoryRoutes = require('../src/routes/inventoryRoutes');
const financeRoutes = require('../src/routes/financeRoutes');
const userRoutes = require('../src/routes/userRoutes');

// Create test app
function createTestApp() {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/inventory', inventoryRoutes);
  app.use('/api/finance', financeRoutes);
  app.use('/api/users', userRoutes);

  // Error handling
  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({
      success: false,
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  });

  return app;
}

describe('API Integration Tests', () => {
  let app;
  let adminToken;
  let operatorToken;

  beforeAll(async () => {
    app = createTestApp();

    // Generate test tokens
    adminToken = jwt.sign(
      {
        id: global.testData.testAdmin.id,
        username: global.testData.testAdmin.username,
        role: global.testData.adminRole.name
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    operatorToken = jwt.sign(
      {
        id: global.testData.testOperator.id,
        username: global.testData.testOperator.username,
        role: global.testData.operatorRole.name
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  describe('Authentication Endpoints', () => {
    describe('POST /api/auth/login', () => {
      it('should login with valid credentials', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            username: 'testadmin',
            password: 'testpass123'
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.user).toBeDefined();
        expect(response.body.accessToken).toBeDefined();
        expect(response.body.refreshToken).toBeDefined();
        expect(response.body.user.username).toBe('testadmin');
      });

      it('should reject invalid credentials', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            username: 'testadmin',
            password: 'wrongpassword'
          });


        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Invalid credentials');
      });

      it('should reject missing credentials', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({});

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Please provide username and password');
      });
    });

    describe('GET /api/auth/me', () => {
      it('should return user info with valid token', async () => {
        const response = await request(app)
          .get('/api/auth/me')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.user).toBeDefined();
        expect(response.body.user.username).toBe('testadmin');
      });

      it('should reject request without token', async () => {
        const response = await request(app)
          .get('/api/auth/me');

        expect(response.status).toBe(401);
        expect(response.body.success).toBe(false);
      });

      it('should reject request with invalid token', async () => {
        const response = await request(app)
          .get('/api/auth/me')
          .set('Authorization', 'Bearer invalid-token');

        expect(response.status).toBe(401);
        expect(response.body.success).toBe(false);
      });
    });
  });

  describe('Inventory Endpoints', () => {
    describe('GET /api/inventory/categories', () => {
      it('should return categories for authorized user', async () => {
        const response = await request(app)
          .get('/api/inventory/categories')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeInstanceOf(Array);
        expect(response.body.count).toBeGreaterThan(0);
      });

      it('should reject unauthorized access', async () => {
        const response = await request(app)
          .get('/api/inventory/categories');

        expect(response.status).toBe(401);
        expect(response.body.success).toBe(false);
      });
    });

    describe('POST /api/inventory/categories', () => {
      it('should create new category with admin permissions', async () => {
        const newCategory = {
          name: 'Integration Test Category',
          code: 'ITC',
          description: 'Created during integration testing'
        };

        const response = await request(app)
          .post('/api/inventory/categories')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(newCategory);

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data.name).toBe(newCategory.name);
        expect(response.body.data.code).toBe(newCategory.code);
      });

      it('should reject duplicate category names', async () => {
        const duplicateCategory = {
          name: 'Test Battery',
          code: 'TB2'
        };

        const response = await request(app)
          .post('/api/inventory/categories')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(duplicateCategory);

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('already exists');
      });

      it('should reject creation without proper permissions', async () => {
        const newCategory = {
          name: 'Unauthorized Category',
          code: 'UC'
        };

        // Using operator token which doesn't have create permissions
        const response = await request(app)
          .post('/api/inventory/categories')
          .set('Authorization', `Bearer ${operatorToken}`)
          .send(newCategory);

        expect(response.status).toBe(403);
        expect(response.body.success).toBe(false);
      });
    });

    describe('GET /api/inventory/companies', () => {
      it('should return companies list', async () => {
        const response = await request(app)
          .get('/api/inventory/companies')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeInstanceOf(Array);
        expect(response.body.count).toBeGreaterThan(0);
      });
    });

    describe('POST /api/inventory/items', () => {
      it('should create new inventory item', async () => {
        const newItem = {
          categoryId: global.testData.batteryCategory.id,
          modelId: global.testData.testModel.id,
          condition: 'New',
          status: 'In Store',
          specifications: {
            voltage: '48V',
            cells: 16
          },
          purchasePrice: 15000.00,
          purchaseDate: new Date().toISOString()
        };

        const response = await request(app)
          .post('/api/inventory/items')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(newItem);

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data.serialNumber).toBeDefined();
        expect(response.body.data.status).toBe('In Store');
        expect(response.body.data.specifications.voltage).toBe('48V');
      });

      it('should validate required fields', async () => {
        const invalidItem = {
          condition: 'New'
          // Missing required fields
        };

        const response = await request(app)
          .post('/api/inventory/items')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(invalidItem);

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });
    });
  });

  describe('Finance Endpoints', () => {
    describe('GET /api/finance/customers', () => {
      it('should return customers list', async () => {
        const response = await request(app)
          .get('/api/finance/customers')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeInstanceOf(Array);
        expect(response.body.count).toBeGreaterThan(0);
      });

      it('should support search filtering', async () => {
        const response = await request(app)
          .get('/api/finance/customers?search=Test Customer')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeInstanceOf(Array);
      });
    });

    describe('POST /api/finance/customers', () => {
      it('should create new customer', async () => {
        const newCustomer = {
          name: 'Integration Test Customer',
          phone: '1111111111',
          email: 'integration@test.com',
          company: 'Test Corp',
          address: 'Test Address',
          creditLimit: 25000.00
        };

        const response = await request(app)
          .post('/api/finance/customers')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(newCustomer);

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data.name).toBe(newCustomer.name);
        expect(response.body.data.phone).toBe(newCustomer.phone);
      });

      it('should reject duplicate phone numbers', async () => {
        const duplicateCustomer = {
          name: 'Another Customer',
          phone: '9876543210', // Existing phone
          email: 'another@test.com'
        };

        const response = await request(app)
          .post('/api/finance/customers')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(duplicateCustomer);

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('phone number already exists');
      });
    });
  });

  describe('User Management Endpoints', () => {
    describe('GET /api/users', () => {
      it('should return users list for admin', async () => {
        const response = await request(app)
          .get('/api/users')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeInstanceOf(Array);
        expect(response.body.count).toBeGreaterThan(0);
      });

      it('should reject access for non-admin users', async () => {
        const response = await request(app)
          .get('/api/users')
          .set('Authorization', `Bearer ${operatorToken}`);

        expect(response.status).toBe(403);
        expect(response.body.success).toBe(false);
      });
    });

    describe('POST /api/users', () => {
      it('should create new user with admin permissions', async () => {
        const newUser = {
          username: 'integrationuser',
          password: 'testpass123',
          fullName: 'Integration Test User',
          email: 'integration@user.com',
          roleId: global.testData.operatorRole.id
        };

        const response = await request(app)
          .post('/api/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(newUser);

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data.username).toBe(newUser.username);
        expect(response.body.data.fullName).toBe(newUser.fullName);
      });

      it('should validate required fields', async () => {
        const invalidUser = {
          username: 'incomplete'
          // Missing required fields
        };

        const response = await request(app)
          .post('/api/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(invalidUser);

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });
    });
  });

  describe('Cross-Service Integration', () => {
    it('should maintain data consistency across related entities', async () => {
      // Create a customer
      const customerResponse = await request(app)
        .post('/api/finance/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Cross-Service Test Customer',
          phone: '2222222222',
          email: 'crossservice@test.com',
          creditLimit: 30000.00
        });

      expect(customerResponse.status).toBe(201);
      const customerId = customerResponse.body.data.id;

      // Create an inventory item
      const itemResponse = await request(app)
        .post('/api/inventory/items')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          categoryId: global.testData.batteryCategory.id,
          modelId: global.testData.testModel.id,
          condition: 'New',
          status: 'In Store',
          specifications: { voltage: '48V', cells: 16 },
          purchasePrice: 20000.00
        });

      expect(itemResponse.status).toBe(201);
      const itemId = itemResponse.body.data.id;

      // Verify both entities exist and are linked properly
      const customerCheck = await request(app)
        .get(`/api/finance/customers/${customerId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      const itemCheck = await request(app)
        .get(`/api/inventory/items/${itemResponse.body.data.serialNumber}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(customerCheck.status).toBe(200);
      expect(itemCheck.status).toBe(200);
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle database constraint violations gracefully', async () => {
      // Try to create category with existing code
      const response = await request(app)
        .post('/api/inventory/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Another Test Battery',
          code: 'TB' // Existing code
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('already exists');
    });

    it('should handle invalid foreign key references', async () => {
      const response = await request(app)
        .post('/api/inventory/items')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          categoryId: 'invalid-uuid',
          modelId: 'invalid-uuid',
          condition: 'New',
          status: 'In Store'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should handle malformed JSON gracefully', async () => {
      const response = await request(app)
        .post('/api/inventory/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Permission Integration', () => {
    it('should enforce role-based permissions across endpoints', async () => {
      // Operator should be able to view but not create
      const viewResponse = await request(app)
        .get('/api/inventory/categories')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(viewResponse.status).toBe(200);

      const createResponse = await request(app)
        .post('/api/inventory/categories')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          name: 'Should Fail',
          code: 'SF'
        });

      expect(createResponse.status).toBe(403);
    });

    it('should allow admin to access all endpoints', async () => {
      const endpoints = [
        '/api/inventory/categories',
        '/api/inventory/companies',
        '/api/finance/customers',
        '/api/users'
      ];

      for (const endpoint of endpoints) {
        const response = await request(app)
          .get(endpoint)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
      }
    });
  });
});