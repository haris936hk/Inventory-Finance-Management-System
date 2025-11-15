// ========== prisma/seed.js ==========
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ==================== SEED CHART OF ACCOUNTS ====================
  console.log('\n📊 Seeding Chart of Accounts...');

  // Assets (1xxx)
  await prisma.account.upsert({
    where: { code: '1100' },
    update: {},
    create: {
      code: '1100',
      name: 'Cash',
      type: 'Asset',
      currentBalance: 0
    }
  });

  await prisma.account.upsert({
    where: { code: '1200' },
    update: {},
    create: {
      code: '1200',
      name: 'Accounts Receivable',
      type: 'Asset',
      currentBalance: 0
    }
  });

  await prisma.account.upsert({
    where: { code: '1210' },
    update: {},
    create: {
      code: '1210',
      name: 'Input Tax Receivable',
      type: 'Asset',
      currentBalance: 0
    }
  });

  await prisma.account.upsert({
    where: { code: '1300' },
    update: {},
    create: {
      code: '1300',
      name: 'Inventory',
      type: 'Asset',
      currentBalance: 0
    }
  });

  // Liabilities (2xxx)
  await prisma.account.upsert({
    where: { code: '2000' },
    update: {},
    create: {
      code: '2000',
      name: 'Accounts Payable',
      type: 'Liability',
      currentBalance: 0
    }
  });

  await prisma.account.upsert({
    where: { code: '2100' },
    update: {},
    create: {
      code: '2100',
      name: 'Sales Tax Payable',
      type: 'Liability',
      currentBalance: 0
    }
  });

  // Equity (3xxx)
  await prisma.account.upsert({
    where: { code: '3900' },
    update: {},
    create: {
      code: '3900',
      name: 'Opening Balance Equity',
      type: 'Equity',
      currentBalance: 0
    }
  });

  // Revenue (4xxx)
  await prisma.account.upsert({
    where: { code: '4000' },
    update: {},
    create: {
      code: '4000',
      name: 'Sales Revenue',
      type: 'Income',
      currentBalance: 0
    }
  });

  // Expenses (5xxx)
  await prisma.account.upsert({
    where: { code: '5000' },
    update: {},
    create: {
      code: '5000',
      name: 'Cost of Goods Sold',
      type: 'Expense',
      currentBalance: 0
    }
  });

  console.log('✅ Chart of Accounts seeded (9 accounts)');

  // ==================== SEED ROLES AND USERS ====================
  console.log('\n👥 Seeding Roles and Users...');

  // Create roles
  const inventoryRole = await prisma.role.upsert({
    where: { name: 'Inventory Operator' },
    update: {
      permissions: [
        'inventory.view',
        'inventory.create',
        'inventory.edit',
        'reports.view',
        'settings.view'  // Can only view settings, not edit
      ]
    },
    create: {
      name: 'Inventory Operator',
      description: 'Access to inventory module only',
      permissions: [
        'inventory.view',
        'inventory.create',
        'inventory.edit',
        'reports.view',
        'settings.view'  // Can only view settings, not edit
      ]
    }
  });

  const operatorRole = await prisma.role.upsert({
    where: { name: 'Financial + Inventory Operator' },
    update: {
      permissions: [
        'inventory.view', 'inventory.create', 'inventory.edit', 'inventory.delete',
        'finance.view', 'finance.create', 'finance.edit', 'finance.delete',
        'reports.view', 'reports.export',
        'settings.view'  // Can only view settings, not edit
      ]
    },
    create: {
      name: 'Financial + Inventory Operator',
      description: 'Full access to inventory and finance modules',
      permissions: [
        'inventory.view', 'inventory.create', 'inventory.edit', 'inventory.delete',
        'finance.view', 'finance.create', 'finance.edit', 'finance.delete',
        'reports.view', 'reports.export',
        'settings.view'  // Can only view settings, not edit
      ]
    }
  });

  // Create Admin role with full system access
  const adminRole = await prisma.role.upsert({
    where: { name: 'Admin' },
    update: {
      permissions: [
        // Inventory permissions
        'inventory.view', 'inventory.create', 'inventory.edit', 'inventory.delete',
        // Finance permissions
        'finance.view', 'finance.create', 'finance.edit', 'finance.delete',
        // Reports permissions
        'reports.view', 'reports.export',
        // User management permissions
        'users.view', 'users.create', 'users.edit', 'users.delete',
        // Role management permissions
        'roles.view', 'roles.create', 'roles.edit', 'roles.delete',
        // Settings management permissions
        'settings.view', 'settings.edit'
      ]
    },
    create: {
      name: 'Admin',
      description: 'Administrator with full system access including user management, roles, and settings',
      permissions: [
        // Inventory permissions
        'inventory.view', 'inventory.create', 'inventory.edit', 'inventory.delete',
        // Finance permissions
        'finance.view', 'finance.create', 'finance.edit', 'finance.delete',
        // Reports permissions
        'reports.view', 'reports.export',
        // User management permissions
        'users.view', 'users.create', 'users.edit', 'users.delete',
        // Role management permissions
        'roles.view', 'roles.create', 'roles.edit', 'roles.delete',
        // Settings management permissions
        'settings.view', 'settings.edit'
      ]
    }
  });

  // Create admin user
  const hashedPassword = await bcrypt.hash('admin123', 10);

  const adminUser = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {
      roleId: adminRole.id  // Update to Admin role if exists
    },
    create: {
      username: 'admin',
      password: hashedPassword,
      fullName: 'System Administrator',
      email: 'admin@company.com',
      roleId: adminRole.id
    }
  });

  console.log('✅ Admin user created with Admin role');
  console.log('   Username: admin');
  console.log('   Password: admin123');

  // Create additional users for testing
  const inventoryUser = await prisma.user.upsert({
    where: { username: 'inventory' },
    update: { roleId: inventoryRole.id },
    create: {
      username: 'inventory',
      password: hashedPassword,
      fullName: 'Inventory Manager',
      email: 'inventory@company.com',
      phone: '+92-300-1234567',
      roleId: inventoryRole.id
    }
  });

  const operatorUser = await prisma.user.upsert({
    where: { username: 'operator' },
    update: { roleId: operatorRole.id },
    create: {
      username: 'operator',
      password: hashedPassword,
      fullName: 'Finance & Inventory Operator',
      email: 'operator@company.com',
      phone: '+92-300-7654321',
      roleId: operatorRole.id
    }
  });

  console.log('✅ Additional users created:');
  console.log('   Username: inventory | Password: admin123');
  console.log('   Username: operator | Password: admin123');

  console.log('\n========================================');
  console.log('✅ SEEDING COMPLETED SUCCESSFULLY!');
  console.log('========================================');
  console.log('\n📊 Summary:');
  console.log(`   - 9 Chart of Accounts (Assets, Liabilities, Equity, Income, Expenses)`);
  console.log(`   - 3 Roles (Admin, Inventory Operator, Financial + Inventory Operator)`);
  console.log(`   - 3 Users (admin, inventory, operator)`);
  console.log('\n💰 Chart of Accounts:');
  console.log('   Assets: Cash (1100), A/R (1200), Input Tax (1210), Inventory (1300)');
  console.log('   Liabilities: A/P (2000), Sales Tax Payable (2100)');
  console.log('   Equity: Opening Balance Equity (3900)');
  console.log('   Income: Sales Revenue (4000)');
  console.log('   Expenses: COGS (5000)');
  console.log('\n🔐 Login Credentials:');
  console.log('   Username: admin     | Password: admin123 | Role: Admin');
  console.log('   Username: inventory | Password: admin123 | Role: Inventory Operator');
  console.log('   Username: operator  | Password: admin123 | Role: Financial + Inventory Operator');
  console.log('========================================\n');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
