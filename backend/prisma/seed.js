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

  console.log('✅ Companies created');

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

  console.log('✅ Categories created');

  // Get created categories and companies for product models
  const lithiumCategory = await prisma.productCategory.findUnique({ where: { name: 'Lithium Battery' } });
  const rectifierBPCategory = await prisma.productCategory.findUnique({ where: { name: 'Rectifier Back Plane' } });
  const rectifierModCategory = await prisma.productCategory.findUnique({ where: { name: 'Rectifier Module' } });
  const solarPanelCategory = await prisma.productCategory.findUnique({ where: { name: 'Solar Panel' } });
  const solarControllerCategory = await prisma.productCategory.findUnique({ where: { name: 'Solar Controller' } });
  const solarInverterCategory = await prisma.productCategory.findUnique({ where: { name: 'Solar Inverter' } });

  const visionCompany = await prisma.company.findUnique({ where: { name: 'Vision' } });
  const sacredSunCompany = await prisma.company.findUnique({ where: { name: 'Sacred Sun' } });
  const naradaCompany = await prisma.company.findUnique({ where: { name: 'Narada' } });
  const huaweiCompany = await prisma.company.findUnique({ where: { name: 'Huawei' } });
  const vertivCompany = await prisma.company.findUnique({ where: { name: 'Vertiv' } });

  // Create product models
  const productModels = [
    { name: 'V-LFP48100', code: 'VLBM001', categoryId: lithiumCategory.id, companyId: visionCompany.id, description: 'Vision 48V 100Ah Lithium Battery' },
    { name: 'V-LFP51200', code: 'VLBM002', categoryId: lithiumCategory.id, companyId: visionCompany.id, description: 'Vision 51V 200Ah Lithium Battery' },
    { name: 'SLSLFP48100A', code: 'SSLBM001', categoryId: lithiumCategory.id, companyId: sacredSunCompany.id, description: 'Sacred Sun 48V 100Ah Lithium Battery' },
    { name: 'REI48-3000A', code: 'NARBP001', categoryId: rectifierBPCategory.id, companyId: naradaCompany.id, description: 'Narada Rectifier Backplane 3000A' },
    { name: 'R48-3000e3', code: 'HWRM001', categoryId: rectifierModCategory.id, companyId: huaweiCompany.id, description: 'Huawei Rectifier Module 48V 3000W' },
    { name: 'NetSure701A51', code: 'VERTBP001', categoryId: rectifierBPCategory.id, companyId: vertivCompany.id, description: 'Vertiv NetSure Backplane' },
    { name: 'SP-400W', code: 'HWSP001', categoryId: solarPanelCategory.id, companyId: huaweiCompany.id, description: 'Huawei Solar Panel 400W' },
    { name: 'SC-60A', code: 'HWSC001', categoryId: solarControllerCategory.id, companyId: huaweiCompany.id, description: 'Huawei Solar Controller 60A' },
    { name: 'SI-5000', code: 'HWSI001', categoryId: solarInverterCategory.id, companyId: huaweiCompany.id, description: 'Huawei Solar Inverter 5000W' }
  ];

  const createdModels = [];
  for (const model of productModels) {
    const m = await prisma.productModel.upsert({
      where: { code: model.code },
      update: model,
      create: model
    });
    createdModels.push(m);
  }

  console.log(`✅ ${createdModels.length} Product Models created`);

  console.log('\n========================================');
  console.log('✅ SEEDING COMPLETED SUCCESSFULLY!');
  console.log('========================================');
  console.log('\n📊 Summary:');
  console.log('   - 3 Roles (Admin, Inventory Operator, Financial + Inventory Operator)');
  console.log('   - 3 Users (admin, inventory, operator)');
  console.log('   - 6 Product Categories');
  console.log('   - 7 Companies');
  console.log(`   - ${createdModels.length} Product Models`);
  console.log('\n🔐 Login Credentials:');
  console.log('   Username: admin     | Password: admin123 | Role: Admin');
  console.log('   Username: inventory | Password: admin123 | Role: Inventory Operator');
  console.log('   Username: operator  | Password: admin123 | Role: Financial + Inventory Operator');
  console.log('========================================\n');
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