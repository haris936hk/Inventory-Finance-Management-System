// ========== prisma/seed.js ==========
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create roles
  const inventoryRole = await prisma.role.upsert({
    where: { name: 'Inventory Operator' },
    update: {
      permissions: [
        'inventory.view',
        'inventory.create',
        'inventory.edit',
        'reports.view',
        'settings.view'
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
        'settings.view'
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
        'settings.view'
      ]
    },
    create: {
      name: 'Financial + Inventory Operator',
      description: 'Full access to inventory and finance modules',
      permissions: [
        'inventory.view', 'inventory.create', 'inventory.edit', 'inventory.delete',
        'finance.view', 'finance.create', 'finance.edit', 'finance.delete',
        'reports.view', 'reports.export',
        'settings.view'
      ]
    }
  });

  const adminRole = await prisma.role.upsert({
    where: { name: 'Admin' },
    update: {
      permissions: [
        'inventory.view', 'inventory.create', 'inventory.edit', 'inventory.delete',
        'finance.view', 'finance.create', 'finance.edit', 'finance.delete',
        'reports.view', 'reports.export',
        'users.view', 'users.create', 'users.edit', 'users.delete',
        'roles.view', 'roles.create', 'roles.edit', 'roles.delete',
        'settings.view', 'settings.edit'
      ]
    },
    create: {
      name: 'Admin',
      description: 'Administrator with full system access including user management, roles, and settings',
      permissions: [
        'inventory.view', 'inventory.create', 'inventory.edit', 'inventory.delete',
        'finance.view', 'finance.create', 'finance.edit', 'finance.delete',
        'reports.view', 'reports.export',
        'users.view', 'users.create', 'users.edit', 'users.delete',
        'roles.view', 'roles.create', 'roles.edit', 'roles.delete',
        'settings.view', 'settings.edit'
      ]
    }
  });

  // Create users
  const hashedPassword = await bcrypt.hash('admin123', 10);

  await prisma.user.upsert({
    where: { username: 'admin' },
    update: { roleId: adminRole.id },
    create: {
      username: 'admin',
      password: hashedPassword,
      fullName: 'System Administrator',
      email: 'admin@company.com',
      roleId: adminRole.id
    }
  });

  await prisma.user.upsert({
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

  await prisma.user.upsert({
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

  console.log('✅ Users created:');
  console.log('   Username: admin     | Password: admin123 | Role: Admin');
  console.log('   Username: inventory | Password: admin123 | Role: Inventory Operator');
  console.log('   Username: operator  | Password: admin123 | Role: Financial + Inventory Operator');

 

  console.log('\n========================================');
  console.log('✅ SEEDING COMPLETED SUCCESSFULLY!');
  console.log('========================================');
  console.log('\n📊 Summary:');
  console.log('   - 3 Roles (Admin, Inventory Operator, Financial + Inventory Operator)');
  console.log('   - 3 Users (admin, inventory, operator)');
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