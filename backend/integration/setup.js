// Integration test setup
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

// Use the real database connection for integration tests
let prisma;

beforeAll(async () => {
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL || process.env.TEST_DATABASE_URL
      }
    }
  });

  // Connect to database
  await prisma.$connect();

  // Clean up database before tests
  await cleanupDatabase();

  // Seed test data
  await seedTestData();
});

afterAll(async () => {
  // Clean up after all tests
  await cleanupDatabase();
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Clean up between tests if needed
  await cleanupTransactionalData();
});

async function cleanupDatabase() {
  // Clean up in reverse dependency order
  await prisma.payment.deleteMany({});
  await prisma.installment.deleteMany({});
  await prisma.installmentPlan.deleteMany({});
  await prisma.invoiceItem.deleteMany({});
  await prisma.invoice.deleteMany({});
  await prisma.item.deleteMany({});
  await prisma.productModel.deleteMany({});
  await prisma.customer.deleteMany({});
  await prisma.vendor.deleteMany({});
  await prisma.company.deleteMany({});
  await prisma.productCategory.deleteMany({});
  await prisma.warehouse.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.role.deleteMany({});
}

async function cleanupTransactionalData() {
  // Only clean up transactional data between tests
  await prisma.payment.deleteMany({});
  await prisma.invoiceItem.deleteMany({});
  await prisma.invoice.deleteMany({});
  await prisma.item.deleteMany({});
}

async function seedTestData() {
  // Create test roles
  const adminRole = await prisma.role.create({
    data: {
      name: 'Financial + Inventory Operator',
      description: 'Full access for testing',
      permissions: [
        'inventory.view', 'inventory.create', 'inventory.edit', 'inventory.delete',
        'finance.view', 'finance.create', 'finance.edit', 'finance.delete',
        'reports.view', 'reports.export',
        'users.view', 'users.create', 'users.edit', 'users.delete'
      ]
    }
  });

  const operatorRole = await prisma.role.create({
    data: {
      name: 'Inventory Operator',
      description: 'Inventory only access',
      permissions: [
        'inventory.view', 'inventory.edit',
        'reports.view'
      ]
    }
  });

  // Create test admin user
  const hashedPassword = await bcrypt.hash('testpass123', 10);
  const testAdmin = await prisma.user.create({
    data: {
      username: 'testadmin',
      password: hashedPassword,
      fullName: 'Test Administrator',
      email: 'test@admin.com',
      roleId: adminRole.id
    }
  });

  // Create test operator user
  const testOperator = await prisma.user.create({
    data: {
      username: 'testoperator',
      password: hashedPassword,
      fullName: 'Test Operator',
      email: 'test@operator.com',
      roleId: operatorRole.id
    }
  });

  // Create test warehouse
  const testWarehouse = await prisma.warehouse.create({
    data: {
      name: 'Test Warehouse',
      code: 'TEST',
      address: 'Test Address'
    }
  });

  // Create test categories
  const batteryCategory = await prisma.productCategory.create({
    data: {
      name: 'Test Battery',
      code: 'TB',
      description: 'Test battery category',
      specTemplate: {
        voltage: {
          type: 'select',
          options: ['48V', '51V'],
          required: true
        },
        cells: {
          type: 'number',
          min: 1,
          max: 20,
          required: true
        }
      }
    }
  });

  // Create test companies
  const testCompany = await prisma.company.create({
    data: {
      name: 'Test Company',
      code: 'TC',
      email: 'test@company.com',
      phone: '1234567890'
    }
  });

  // Create test models
  const testModel = await prisma.productModel.create({
    data: {
      name: 'Test Model 48V',
      code: 'TM-48V',
      description: 'Test model for 48V battery',
      categoryId: batteryCategory.id,
      companyId: testCompany.id
    }
  });

  // Create test customer
  const testCustomer = await prisma.customer.create({
    data: {
      name: 'Test Customer',
      phone: '9876543210',
      email: 'test@customer.com',
      company: 'Test Customer Corp',
      address: 'Test Customer Address',
      creditLimit: 50000.00,
      openingBalance: 1000.00,
      currentBalance: 1000.00
    }
  });

  // Create test vendor
  const testVendor = await prisma.vendor.create({
    data: {
      name: 'Test Vendor',
      code: 'TV',
      email: 'test@vendor.com',
      phone: '5555555555',
      address: 'Test Vendor Address',
      openingBalance: 0,
      currentBalance: 0
    }
  });

  // Store test data in global for access in tests
  global.testData = {
    adminRole,
    operatorRole,
    testAdmin,
    testOperator,
    testWarehouse,
    batteryCategory,
    testCompany,
    testModel,
    testCustomer,
    testVendor
  };
}

global.prisma = prisma;
global.cleanupTransactionalData = cleanupTransactionalData;