// System test setup - uses same database setup as integration tests
// but with additional system-level configurations

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

let prisma;

beforeAll(async () => {
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL || process.env.TEST_DATABASE_URL
      }
    }
  });

  await prisma.$connect();
  await cleanupDatabase();
  await seedSystemTestData();
});

afterAll(async () => {
  await cleanupDatabase();
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Clean up transactional data between system tests
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
  // Clean up data that might interfere between tests
  await prisma.payment.deleteMany({});
  await prisma.installment.deleteMany({});
  await prisma.installmentPlan.deleteMany({});
  await prisma.invoiceItem.deleteMany({});
  await prisma.invoice.deleteMany({});

  // Reset item statuses but keep the items for system testing
  await prisma.item.updateMany({
    data: {
      status: 'In Store',
      statusHistory: [{
        status: 'In Store',
        date: new Date(),
        userId: global.testData?.testAdmin?.id || 'system',
        notes: 'Reset for system testing'
      }],
      sellingPrice: null,
      outboundDate: null,
      clientName: null,
      clientPhone: null,
      clientEmail: null,
      clientAddress: null
    }
  });
}

async function seedSystemTestData() {
  // Create comprehensive test data for system testing

  // Create roles with comprehensive permissions for system testing
  const adminRole = await prisma.role.create({
    data: {
      name: 'System Test Admin',
      description: 'Full system access for system testing',
      permissions: [
        'inventory.view', 'inventory.create', 'inventory.edit', 'inventory.delete',
        'finance.view', 'finance.create', 'finance.edit', 'finance.delete',
        'reports.view', 'reports.export',
        'users.view', 'users.create', 'users.edit', 'users.delete',
        'system.admin'
      ]
    }
  });

  const operatorRole = await prisma.role.create({
    data: {
      name: 'System Test Operator',
      description: 'Limited access for system testing',
      permissions: [
        'inventory.view', 'inventory.edit',
        'finance.view',
        'reports.view'
      ]
    }
  });

  // Create test users
  const hashedPassword = await bcrypt.hash('systemtest123', 10);

  const testAdmin = await prisma.user.create({
    data: {
      username: 'systemadmin',
      password: hashedPassword,
      fullName: 'System Test Administrator',
      email: 'systemadmin@test.com',
      phone: '1111111111',
      roleId: adminRole.id
    }
  });

  const testOperator = await prisma.user.create({
    data: {
      username: 'systemoperator',
      password: hashedPassword,
      fullName: 'System Test Operator',
      email: 'systemoperator@test.com',
      phone: '2222222222',
      roleId: operatorRole.id
    }
  });

  // Create test warehouse
  const testWarehouse = await prisma.warehouse.create({
    data: {
      name: 'System Test Warehouse',
      code: 'STW',
      address: 'System Test Warehouse Address',
      isActive: true
    }
  });

  // Create base product categories for system testing
  const electronicsCategory = await prisma.productCategory.create({
    data: {
      name: 'System Test Electronics',
      code: 'STE',
      description: 'Electronics for comprehensive system testing',
      specTemplate: {
        voltage: {
          type: 'select',
          options: ['12V', '24V', '48V'],
          required: true
        },
        power: {
          type: 'number',
          min: 1,
          max: 2000,
          required: true
        },
        warranty: {
          type: 'select',
          options: ['6 months', '1 year', '2 years'],
          required: false
        }
      }
    }
  });

  // Create test companies
  const techCorp = await prisma.company.create({
    data: {
      name: 'System Tech Corporation',
      code: 'STC',
      email: 'contact@systemtech.com',
      phone: '3333333333',
      address: 'System Tech Corporate Address'
    }
  });

  // Create product models
  const systemModel = await prisma.productModel.create({
    data: {
      name: 'System Test Pro Model',
      code: 'STP-001',
      description: 'Professional model for comprehensive system testing',
      categoryId: electronicsCategory.id,
      companyId: techCorp.id
    }
  });

  // Create base test customer
  const systemCustomer = await prisma.customer.create({
    data: {
      name: 'System Test Customer Corporation',
      phone: '4444444444',
      email: 'customer@systemtest.com',
      company: 'System Test Customer Corp',
      address: 'System Test Customer Address, Test City',
      creditLimit: 500000.00,
      openingBalance: 10000.00,
      currentBalance: 10000.00
    }
  });

  // Create base test vendor
  const systemVendor = await prisma.vendor.create({
    data: {
      name: 'System Test Vendor Ltd',
      code: 'STV',
      email: 'vendor@systemtest.com',
      phone: '5555555555',
      address: 'System Test Vendor Address',
      openingBalance: 0,
      currentBalance: 0
    }
  });

  // Store test data globally for access in tests
  global.testData = {
    adminRole,
    operatorRole,
    testAdmin,
    testOperator,
    testWarehouse,
    electronicsCategory,
    techCorp,
    systemModel,
    systemCustomer,
    systemVendor
  };

  console.log('✅ System test data seeded successfully');
}

global.prisma = prisma;
global.cleanupTransactionalData = cleanupTransactionalData;