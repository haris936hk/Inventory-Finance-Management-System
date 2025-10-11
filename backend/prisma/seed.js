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

  // Create product categories
  const categories = [
    { name: 'Lithium Battery', code: 'LB' },
    { name: 'Rectifier Back Plane', code: 'RBP' },
    { name: 'Rectifier Module', code: 'RM' },
    { name: 'Solar Panel', code: 'SP' },
    { name: 'Solar Controller', code: 'SC' },
    { name: 'Solar Inverter', code: 'SI' }
  ];

  for (const category of categories) {
    await prisma.productCategory.upsert({
      where: { name: category.name },
      update: {},
      create: {
        name: category.name,
        code: category.code,
        specTemplate: getSpecTemplate(category.name)
      }
    });
  }

  // Create companies
  const companies = [
    'Vision', 'Sacred Sun', 'Narada', 'Vertiv', 
    'Huawei', 'Delta', 'Schneider'
  ];

  for (const company of companies) {
    await prisma.company.upsert({
      where: { name: company },
      update: {},
      create: {
        name: company,
        code: company.substring(0, 3).toUpperCase()
      }
    });
  }

  // Create single warehouse
  await prisma.warehouse.upsert({
    where: { code: 'MAIN' },
    update: {},
    create: {
      name: 'Main Warehouse',
      code: 'MAIN',
      address: 'Rawalpindi, Punjab, Pakistan'
    }
  });

  console.log('✅ Seeding completed!');
}

function getSpecTemplate(categoryName) {
  const templates = {
    'Lithium Battery': {
      voltage: {
        type: 'select',
        options: ['48V', '51V', '24V'],
        required: true
      },
      cells: {
        type: 'number',
        min: 1,
        max: 20,
        required: true
      },
      bms: {
        type: 'select',
        options: ['Supported', 'Not Supported'],
        required: true
      },
      lcd: {
        type: 'select',
        options: ['Yes', 'No', 'NA'],
        required: false
      }
    },
    'Rectifier Back Plane': {
      slots: {
        type: 'select',
        options: ['4 Slots', '5 Slots', '6 Slots'],
        required: true
      }
    },
    'Solar Panel': {
      watt: {
        type: 'number',
        min: 100,
        max: 1000,
        required: true
      }
    }
  };

  return templates[categoryName] || null;
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });