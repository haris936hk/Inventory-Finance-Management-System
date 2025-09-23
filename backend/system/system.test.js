// ========== System Testing Suite ==========
// Tests the complete and integrated software system to ensure it meets
// specified requirements and functions as a whole

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

describe('System Testing - Complete Inventory & Finance Management System', () => {
  let app;
  let adminToken;
  let operatorToken;
  let systemData = {}; // Store created entities for cross-module testing

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

  describe('ST-001: Complete Inventory Management Workflow', () => {
    it('should execute complete inventory setup and item lifecycle', async () => {
      // 1. Create Product Category
      const categoryResponse = await request(app)
        .post('/api/inventory/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'System Test Electronics',
          code: 'STE',
          description: 'Electronics for system testing',
          specTemplate: {
            voltage: { type: 'select', options: ['12V', '24V'], required: true },
            power: { type: 'number', min: 1, max: 1000, required: true }
          }
        });

      expect(categoryResponse.status).toBe(201);
      expect(categoryResponse.body.success).toBe(true);
      systemData.category = categoryResponse.body.data;

      // 2. Create Company
      const companyResponse = await request(app)
        .post('/api/inventory/companies')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'System Test Corp',
          code: 'STC',
          email: 'test@systemtest.com',
          phone: '1234567890'
        });

      expect(companyResponse.status).toBe(201);
      systemData.company = companyResponse.body.data;

      // 3. Create Product Model
      const modelResponse = await request(app)
        .post('/api/inventory/models')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'System Test Model X1',
          code: 'STM-X1',
          description: 'High-performance model for system testing',
          categoryId: systemData.category.id,
          companyId: systemData.company.id
        });

      expect(modelResponse.status).toBe(201);
      systemData.model = modelResponse.body.data;

      // 4. Create Inventory Items (Multiple items to test inventory tracking)
      const items = [];
      for (let i = 1; i <= 3; i++) {
        const itemResponse = await request(app)
          .post('/api/inventory/items')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            modelId: systemData.model.id,
            condition: 'New',
            status: 'In Store',
            specifications: {
              voltage: '24V',
              power: 100 + i * 50
            },
            purchasePrice: 5000.00 + i * 1000,
            purchaseDate: new Date().toISOString()
          });

        expect(itemResponse.status).toBe(201);
        expect(itemResponse.body.data.serialNumber).toMatch(/STE-\d{4}-\d{4}/);
        items.push(itemResponse.body.data);
      }
      systemData.items = items;

      // 5. Verify Stock Summary
      const stockResponse = await request(app)
        .get('/api/inventory/stock-summary')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(stockResponse.status).toBe(200);
      expect(stockResponse.body.success).toBe(true);

      // Should include our new category in stock summary
      const categoryStock = stockResponse.body.data.find(
        stock => stock.categoryId === systemData.category.id
      );
      expect(categoryStock).toBeDefined();
      expect(categoryStock.totalItems).toBe(3);
      expect(categoryStock.inStoreCount).toBe(3);
    });

    it('should handle item status transitions correctly', async () => {
      const item = systemData.items[0];

      // Update item status from 'In Store' to 'Sold'
      const statusResponse = await request(app)
        .put(`/api/inventory/items/${item.serialNumber}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'Sold',
          notes: 'Sold to customer via system test',
          sellingPrice: 7500.00,
          clientName: 'System Test Customer',
          clientPhone: '9876543210'
        });

      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body.data.status).toBe('Sold');
      expect(statusResponse.body.data.sellingPrice).toBe(7500.00);

      // Verify status history is maintained
      expect(statusResponse.body.data.statusHistory).toHaveLength(2);
      expect(statusResponse.body.data.statusHistory[1].status).toBe('Sold');
    });
  });

  describe('ST-002: Complete Financial Management Workflow', () => {
    beforeAll(async () => {
      // Create a customer for financial testing
      const customerResponse = await request(app)
        .post('/api/finance/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'System Test Customer Ltd',
          phone: '5555555555',
          email: 'customer@systemtest.com',
          company: 'System Test Customer Corp',
          address: 'System Test Address, City',
          creditLimit: 100000.00,
          openingBalance: 5000.00
        });

      expect(customerResponse.status).toBe(201);
      systemData.customer = customerResponse.body.data;
    });

    it('should execute complete invoice and payment workflow', async () => {
      // 1. Create Invoice with multiple line items
      const invoiceResponse = await request(app)
        .post('/api/finance/invoices')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customerId: systemData.customer.id,
          items: [
            {
              itemId: systemData.items[0].id,
              description: 'System Test Model X1 - Unit 1',
              quantity: 1,
              unitPrice: 7500.00
            },
            {
              itemId: systemData.items[1].id,
              description: 'System Test Model X1 - Unit 2',
              quantity: 1,
              unitPrice: 8500.00
            }
          ],
          taxRate: 17.0, // GST rate in Pakistan
          discountValue: 500.00,
          discountType: 'Fixed',
          notes: 'System test invoice - bulk purchase'
        });

      expect(invoiceResponse.status).toBe(201);
      expect(invoiceResponse.body.success).toBe(true);

      const invoice = invoiceResponse.body.data;
      systemData.invoice = invoice;

      // Verify invoice calculations
      expect(invoice.subtotal).toBe(16000.00); // 7500 + 8500
      expect(invoice.discountAmount).toBe(500.00);
      expect(invoice.taxableAmount).toBe(15500.00); // 16000 - 500
      expect(invoice.taxAmount).toBe(2635.00); // 15500 * 0.17
      expect(invoice.totalAmount).toBe(18135.00); // 15500 + 2635

      // 2. Process partial payment
      const paymentResponse = await request(app)
        .post('/api/finance/payments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customerId: systemData.customer.id,
          invoiceId: invoice.id,
          amount: 10000.00,
          paymentMethod: 'Bank Transfer',
          paymentDate: new Date().toISOString(),
          notes: 'Partial payment - system test'
        });

      expect(paymentResponse.status).toBe(201);
      systemData.payment = paymentResponse.body.data;

      // 3. Create installment plan for remaining balance
      const installmentResponse = await request(app)
        .post('/api/finance/installment-plans')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customerId: systemData.customer.id,
          invoiceId: invoice.id,
          totalAmount: 8135.00, // Remaining balance
          numberOfInstallments: 3,
          installmentAmount: 2711.67, // 8135 / 3
          startDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
          frequency: 'Monthly'
        });

      expect(installmentResponse.status).toBe(201);
      systemData.installmentPlan = installmentResponse.body.data;

      // 4. Verify customer balance is updated
      const customerCheckResponse = await request(app)
        .get(`/api/finance/customers/${systemData.customer.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(customerCheckResponse.status).toBe(200);
      const updatedCustomer = customerCheckResponse.body.data;

      // Customer balance should reflect the invoice and payment
      expect(updatedCustomer.currentBalance).toBe(13135.00); // 5000 + 18135 - 10000
    });
  });

  describe('ST-003: Role-Based Access Control System', () => {
    it('should enforce comprehensive role-based permissions', async () => {
      // Test Admin permissions (should have full access)
      const adminCategoriesResponse = await request(app)
        .get('/api/inventory/categories')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminCategoriesResponse.status).toBe(200);

      const adminUsersResponse = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminUsersResponse.status).toBe(200);

      // Test Operator permissions (limited access)
      const operatorCategoriesResponse = await request(app)
        .get('/api/inventory/categories')
        .set('Authorization', `Bearer ${operatorToken}`);
      expect(operatorCategoriesResponse.status).toBe(200);

      // Operator should NOT be able to access user management
      const operatorUsersResponse = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${operatorToken}`);
      expect(operatorUsersResponse.status).toBe(403);

      // Operator should NOT be able to create categories
      const operatorCreateResponse = await request(app)
        .post('/api/inventory/categories')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          name: 'Unauthorized Category',
          code: 'UC'
        });
      expect(operatorCreateResponse.status).toBe(403);
    });
  });

  describe('ST-004: Data Integrity and Business Rules', () => {
    it('should maintain data consistency across all modules', async () => {
      // 1. Verify invoice items are linked to inventory correctly
      const invoiceResponse = await request(app)
        .get(`/api/finance/invoices/${systemData.invoice.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(invoiceResponse.status).toBe(200);
      const invoiceDetails = invoiceResponse.body.data;

      expect(invoiceDetails.items).toHaveLength(2);
      expect(invoiceDetails.items[0].itemId).toBe(systemData.items[0].id);
      expect(invoiceDetails.items[1].itemId).toBe(systemData.items[1].id);

      // 2. Verify inventory items show correct sale status
      const item1Response = await request(app)
        .get(`/api/inventory/items/${systemData.items[0].serialNumber}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(item1Response.status).toBe(200);
      expect(item1Response.body.data.status).toBe('Sold');

      // 3. Verify customer financial records are accurate
      const customerLedgerResponse = await request(app)
        .get(`/api/finance/customers/${systemData.customer.id}/ledger`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(customerLedgerResponse.status).toBe(200);
      const ledgerEntries = customerLedgerResponse.body.data;

      // Should have entries for invoice and payment
      const invoiceEntry = ledgerEntries.find(entry => entry.type === 'Invoice');
      const paymentEntry = ledgerEntries.find(entry => entry.type === 'Payment');

      expect(invoiceEntry).toBeDefined();
      expect(paymentEntry).toBeDefined();
      expect(invoiceEntry.amount).toBe(18135.00);
      expect(paymentEntry.amount).toBe(-10000.00); // Negative for payment
    });

    it('should enforce business rules and constraints', async () => {
      // 1. Cannot create duplicate serial numbers
      const duplicateItemResponse = await request(app)
        .post('/api/inventory/items')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          serialNumber: systemData.items[0].serialNumber, // Duplicate
          modelId: systemData.model.id,
          condition: 'New',
          status: 'In Store'
        });

      expect(duplicateItemResponse.status).toBe(400);

      // 2. Cannot create customer with duplicate phone
      const duplicateCustomerResponse = await request(app)
        .post('/api/finance/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Duplicate Customer',
          phone: systemData.customer.phone, // Duplicate
          email: 'duplicate@test.com'
        });

      expect(duplicateCustomerResponse.status).toBe(400);

      // 3. Cannot create invoice with invalid customer
      const invalidInvoiceResponse = await request(app)
        .post('/api/finance/invoices')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customerId: 'invalid-uuid',
          items: [{ description: 'Test', quantity: 1, unitPrice: 100 }]
        });

      expect(invalidInvoiceResponse.status).toBe(400);
    });
  });

  describe('ST-005: System Performance and Load Testing', () => {
    it('should handle concurrent operations efficiently', async () => {
      const startTime = Date.now();

      // Simulate concurrent requests
      const concurrentRequests = [];

      // 10 concurrent category reads
      for (let i = 0; i < 10; i++) {
        concurrentRequests.push(
          request(app)
            .get('/api/inventory/categories')
            .set('Authorization', `Bearer ${adminToken}`)
        );
      }

      // 5 concurrent customer reads
      for (let i = 0; i < 5; i++) {
        concurrentRequests.push(
          request(app)
            .get('/api/finance/customers')
            .set('Authorization', `Bearer ${adminToken}`)
        );
      }

      const responses = await Promise.all(concurrentRequests);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Should complete within reasonable time (5 seconds for 15 concurrent requests)
      expect(totalTime).toBeLessThan(5000);
    });

    it('should maintain response time standards', async () => {
      const performanceTests = [
        { endpoint: '/api/inventory/categories', description: 'Categories list' },
        { endpoint: '/api/finance/customers', description: 'Customers list' },
        { endpoint: '/api/inventory/stock-summary', description: 'Stock summary' },
        { endpoint: '/api/users', description: 'Users list' }
      ];

      for (const test of performanceTests) {
        const startTime = Date.now();

        const response = await request(app)
          .get(test.endpoint)
          .set('Authorization', `Bearer ${adminToken}`);

        const responseTime = Date.now() - startTime;

        expect(response.status).toBe(200);
        expect(responseTime).toBeLessThan(2000); // Should respond within 2 seconds

        console.log(`${test.description}: ${responseTime}ms`);
      }
    });
  });

  describe('ST-006: Error Handling and System Recovery', () => {
    it('should gracefully handle various error scenarios', async () => {
      // 1. Invalid authentication
      const invalidAuthResponse = await request(app)
        .get('/api/inventory/categories')
        .set('Authorization', 'Bearer invalid-token');

      expect(invalidAuthResponse.status).toBe(401);
      expect(invalidAuthResponse.body.success).toBe(false);

      // 2. Malformed JSON
      const malformedResponse = await request(app)
        .post('/api/inventory/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      expect(malformedResponse.status).toBe(400);

      // 3. Missing required fields
      const missingFieldsResponse = await request(app)
        .post('/api/inventory/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({}); // Missing required fields

      expect(missingFieldsResponse.status).toBe(400);

      // 4. Resource not found
      const notFoundResponse = await request(app)
        .get('/api/inventory/categories/invalid-uuid')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(notFoundResponse.status).toBe(404);
    });
  });

  describe('ST-007: Audit Trail and Logging', () => {
    it('should maintain proper audit trails for critical operations', async () => {
      // Create an item to test audit trail
      const auditItemResponse = await request(app)
        .post('/api/inventory/items')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          modelId: systemData.model.id,
          condition: 'New',
          status: 'In Store',
          specifications: { voltage: '12V', power: 75 },
          purchasePrice: 3000.00
        });

      expect(auditItemResponse.status).toBe(201);
      const auditItem = auditItemResponse.body.data;

      // Update the item status
      const statusUpdateResponse = await request(app)
        .put(`/api/inventory/items/${auditItem.serialNumber}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'In Transit',
          notes: 'Moved to warehouse for audit testing'
        });

      expect(statusUpdateResponse.status).toBe(200);

      // Verify audit trail in status history
      const updatedItem = statusUpdateResponse.body.data;
      expect(updatedItem.statusHistory).toHaveLength(2);

      expect(updatedItem.statusHistory[0].status).toBe('In Store');
      expect(updatedItem.statusHistory[0].notes).toBe('Initial entry');

      expect(updatedItem.statusHistory[1].status).toBe('In Transit');
      expect(updatedItem.statusHistory[1].notes).toBe('Moved to warehouse for audit testing');
      expect(updatedItem.statusHistory[1].userId).toBe(global.testData.testAdmin.id);
    });
  });

  describe('ST-008: System Integration Health Check', () => {
    it('should verify all system components are functioning together', async () => {
      // Health check for each major system component
      const healthChecks = {
        authentication: false,
        inventory: false,
        finance: false,
        userManagement: false,
        database: false
      };

      // Test Authentication
      try {
        const authResponse = await request(app)
          .get('/api/auth/me')
          .set('Authorization', `Bearer ${adminToken}`);
        healthChecks.authentication = authResponse.status === 200;
      } catch (error) {
        healthChecks.authentication = false;
      }

      // Test Inventory Module
      try {
        const inventoryResponse = await request(app)
          .get('/api/inventory/categories')
          .set('Authorization', `Bearer ${adminToken}`);
        healthChecks.inventory = inventoryResponse.status === 200;
      } catch (error) {
        healthChecks.inventory = false;
      }

      // Test Finance Module
      try {
        const financeResponse = await request(app)
          .get('/api/finance/customers')
          .set('Authorization', `Bearer ${adminToken}`);
        healthChecks.finance = financeResponse.status === 200;
      } catch (error) {
        healthChecks.finance = false;
      }

      // Test User Management
      try {
        const usersResponse = await request(app)
          .get('/api/users')
          .set('Authorization', `Bearer ${adminToken}`);
        healthChecks.userManagement = usersResponse.status === 200;
      } catch (error) {
        healthChecks.userManagement = false;
      }

      // Test Database Connectivity (implicit through other tests)
      healthChecks.database = healthChecks.inventory && healthChecks.finance;

      // All health checks should pass
      Object.entries(healthChecks).forEach(([component, isHealthy]) => {
        expect(isHealthy).toBe(true);
      });

      console.log('System Health Check Results:', healthChecks);
    });
  });
});