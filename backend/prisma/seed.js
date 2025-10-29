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

  // Create companies first (needed for product models)
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

  console.log('✅ Categories and companies created');

  // Create vendors
  const vendors = [
    {
      name: 'Vision Battery Supplies',
      code: 'VBS001',
      contactPerson: 'Ahmed Khan',
      email: 'ahmed@vision-supplies.pk',
      phone: '+92-51-1234567',
      address: 'Industrial Area, Islamabad',
      paymentTerms: 'Net 30',
      openingBalance: 50000,
      currentBalance: 50000
    },
    {
      name: 'Sacred Sun Pakistan',
      code: 'SSP002',
      contactPerson: 'Sara Ali',
      email: 'sara@sacredsun.pk',
      phone: '+92-42-9876543',
      address: 'Lahore Industrial Estate',
      paymentTerms: 'Net 45',
      openingBalance: 75000,
      currentBalance: 75000
    },
    {
      name: 'Huawei Tech Distributors',
      code: 'HTD003',
      contactPerson: 'Muhammad Bilal',
      email: 'bilal@huaweitech.pk',
      phone: '+92-21-5551234',
      address: 'Karachi Tech Hub',
      paymentTerms: 'Due on Receipt',
      openingBalance: 0,
      currentBalance: 0
    }
  ];

  const createdVendors = [];
  for (const vendor of vendors) {
    const v = await prisma.vendor.upsert({
      where: { code: vendor.code },
      update: vendor,
      create: vendor
    });
    createdVendors.push(v);
  }

  console.log(`✅ ${createdVendors.length} vendors created`);

  // Create customers
  const customers = [
    {
      name: 'Zain Telecommunications',
      phone: '+92-300-1111111',
      email: 'procurement@zain.com',
      address: 'Blue Area, Islamabad',
      nic: '37405-1234567-1',
      company: 'Zain Telecom (Pvt) Ltd',
      creditLimit: 500000,
      openingBalance: 0,
      currentBalance: 0
    },
    {
      name: 'Ali Hassan',
      phone: '+92-321-2222222',
      email: 'ali.hassan@email.com',
      address: 'Satellite Town, Rawalpindi',
      nic: '37405-9876543-2',
      company: null,
      creditLimit: 100000,
      openingBalance: 25000,
      currentBalance: 25000
    },
    {
      name: 'Pak Solar Solutions',
      phone: '+92-300-3333333',
      email: 'contact@paksolar.pk',
      address: 'I-9 Industrial Area, Islamabad',
      nic: null,
      company: 'Pak Solar Solutions (Pvt) Ltd',
      creditLimit: 750000,
      openingBalance: 0,
      currentBalance: 0
    },
    {
      name: 'Fatima Ahmad',
      phone: '+92-333-4444444',
      email: 'fatima@email.com',
      address: 'G-11, Islamabad',
      nic: '61101-5678901-3',
      company: null,
      creditLimit: 50000,
      openingBalance: 0,
      currentBalance: 0
    }
  ];

  const createdCustomers = [];
  for (const customer of customers) {
    const c = await prisma.customer.upsert({
      where: { phone: customer.phone },
      update: customer,
      create: customer
    });
    createdCustomers.push(c);
  }

  console.log(`✅ ${createdCustomers.length} customers created`);

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

  console.log(`✅ ${createdModels.length} product models created`);

  // Create inventory items
  const items = [];

  // Vision Lithium Batteries - Various statuses
  const visionModel1 = createdModels.find(m => m.code === 'VLBM001');
  for (let i = 1; i <= 5; i++) {
    items.push({
      serialNumber: `VIS-LB-48V-2024-${String(i).padStart(4, '0')}`,
      condition: 'New',
      status: i <= 3 ? 'In Store' : (i === 4 ? 'In Lab' : 'In Hand'),
      inventoryStatus: i <= 3 ? 'Available' : (i === 4 ? 'Available' : 'Reserved'),
      repaired: i === 4 ? 'No' : null,
      specifications: { voltage: '48V', cells: 16, bms: 'Supported', lcd: 'Yes' },
      purchasePrice: 85000,
      purchaseDate: new Date('2024-01-15'),
      inboundDate: new Date('2024-01-15'),
      categoryId: lithiumCategory.id,
      modelId: visionModel1.id,
      vendorId: createdVendors[0].id,
      createdById: adminUser.id
    });
  }

  // Sacred Sun Lithium Batteries
  const sacredModel = createdModels.find(m => m.code === 'SSLBM001');
  for (let i = 1; i <= 3; i++) {
    items.push({
      serialNumber: `SS-LB-48V-2024-${String(i).padStart(4, '0')}`,
      condition: 'New',
      status: 'In Store',
      inventoryStatus: 'Available',
      specifications: { voltage: '48V', cells: 16, bms: 'Supported', lcd: 'No' },
      purchasePrice: 82000,
      purchaseDate: new Date('2024-02-01'),
      inboundDate: new Date('2024-02-01'),
      categoryId: lithiumCategory.id,
      modelId: sacredModel.id,
      vendorId: createdVendors[1].id,
      createdById: adminUser.id
    });
  }

  // Huawei Rectifier Modules
  const huaweiRM = createdModels.find(m => m.code === 'HWRM001');
  for (let i = 1; i <= 4; i++) {
    items.push({
      serialNumber: `HW-RM-48V-2024-${String(i).padStart(4, '0')}`,
      condition: 'New',
      status: 'In Store',
      inventoryStatus: 'Available',
      specifications: {},
      purchasePrice: 35000,
      purchaseDate: new Date('2024-02-10'),
      inboundDate: new Date('2024-02-10'),
      categoryId: rectifierModCategory.id,
      modelId: huaweiRM.id,
      vendorId: createdVendors[2].id,
      createdById: adminUser.id
    });
  }

  // Solar Panels
  const solarPanel = createdModels.find(m => m.code === 'HWSP001');
  for (let i = 1; i <= 10; i++) {
    items.push({
      serialNumber: `HW-SP-400W-2024-${String(i).padStart(4, '0')}`,
      condition: 'New',
      status: 'In Store',
      inventoryStatus: 'Available',
      specifications: { watt: 400 },
      purchasePrice: 15000,
      purchaseDate: new Date('2024-03-01'),
      inboundDate: new Date('2024-03-01'),
      categoryId: solarPanelCategory.id,
      modelId: solarPanel.id,
      vendorId: createdVendors[2].id,
      createdById: adminUser.id
    });
  }

  const createdItems = [];
  for (const item of items) {
    const i = await prisma.item.create({ data: item });
    createdItems.push(i);
  }

  console.log(`✅ ${createdItems.length} inventory items created`);

  // Create Purchase Orders
  const po1 = await prisma.purchaseOrder.create({
    data: {
      poNumber: 'PO-2024-001',
      orderDate: new Date('2024-01-10'),
      expectedDate: new Date('2024-01-20'),
      status: 'Completed',
      subtotal: 425000,
      taxAmount: 72250,
      total: 497250,
      billedAmount: 497250,
      vendorId: createdVendors[0].id,
      lineItems: {
        create: [
          {
            description: 'Vision 48V 100Ah Lithium Battery',
            quantity: 5,
            unitPrice: 85000,
            totalPrice: 425000,
            specifications: { voltage: '48V', cells: 16, bms: 'Supported' },
            productModelId: visionModel1.id
          }
        ]
      }
    }
  });

  const po2 = await prisma.purchaseOrder.create({
    data: {
      poNumber: 'PO-2024-002',
      orderDate: new Date('2024-02-05'),
      expectedDate: new Date('2024-02-15'),
      status: 'Partial',
      subtotal: 150000,
      taxAmount: 25500,
      total: 175500,
      billedAmount: 100000,
      vendorId: createdVendors[2].id,
      lineItems: {
        create: [
          {
            description: 'Huawei Solar Panel 400W',
            quantity: 10,
            unitPrice: 15000,
            totalPrice: 150000,
            specifications: { watt: 400 },
            productModelId: solarPanel.id
          }
        ]
      }
    }
  });

  console.log('✅ Purchase orders created');

  // Create Bills for POs
  const bill1 = await prisma.bill.create({
    data: {
      billNumber: 'BILL-2024-001',
      billDate: new Date('2024-01-15'),
      dueDate: new Date('2024-02-14'),
      status: 'Paid',
      subtotal: 425000,
      taxAmount: 72250,
      total: 497250,
      paidAmount: 497250,
      vendorId: createdVendors[0].id,
      purchaseOrderId: po1.id
    }
  });

  const bill2 = await prisma.bill.create({
    data: {
      billNumber: 'BILL-2024-002',
      billDate: new Date('2024-02-10'),
      dueDate: new Date('2024-03-10'),
      status: 'Unpaid',
      subtotal: 88000,
      taxAmount: 14960,
      total: 102960,
      paidAmount: 0,
      vendorId: createdVendors[2].id,
      purchaseOrderId: po2.id
    }
  });

  console.log('✅ Bills created');

  // Create Vendor Payment for Bill1
  await prisma.vendorPayment.create({
    data: {
      paymentNumber: 'VP-2024-001',
      paymentDate: new Date('2024-01-20'),
      amount: 497250,
      method: 'Bank Transfer',
      reference: 'TXN-20240120-VBS001',
      notes: 'Full payment for PO-2024-001',
      vendorId: createdVendors[0].id,
      billId: bill1.id,
      createdBy: adminUser.id
    }
  });

  console.log('✅ Vendor payments created');

  // Create Invoices
  const availableItems = createdItems.filter(i => i.inventoryStatus === 'Available').slice(0, 2);

  const invoice1 = await prisma.invoice.create({
    data: {
      invoiceNumber: 'INV-2024-001',
      invoiceDate: new Date('2024-02-15'),
      dueDate: new Date('2024-03-15'),
      status: 'Paid',
      subtotal: 170000,
      taxType: 'GST',
      taxRate: 17,
      taxAmount: 28900,
      total: 198900,
      paidAmount: 198900,
      terms: 'Payment due within 30 days',
      notes: 'Includes installation support',
      customerId: createdCustomers[1].id,
      createdById: adminUser.id,
      items: {
        create: [
          {
            quantity: 1,
            unitPrice: 170000,
            total: 170000,
            description: 'Vision 48V 100Ah Lithium Battery',
            itemId: availableItems[0].id
          }
        ]
      }
    }
  });

  // Update item status for sold item
  await prisma.item.update({
    where: { id: availableItems[0].id },
    data: {
      inventoryStatus: 'Sold',
      status: 'Sold',
      sellingPrice: 170000,
      outboundDate: new Date('2024-02-15'),
      customerId: createdCustomers[1].id
    }
  });

  const invoice2 = await prisma.invoice.create({
    data: {
      invoiceNumber: 'INV-2024-002',
      invoiceDate: new Date('2024-03-01'),
      dueDate: new Date('2024-04-01'),
      status: 'Partial',
      subtotal: 164000,
      taxType: 'GST',
      taxRate: 17,
      taxAmount: 27880,
      total: 191880,
      paidAmount: 100000,
      terms: 'Payment due within 30 days',
      customerId: createdCustomers[2].id,
      createdById: adminUser.id,
      items: {
        create: [
          {
            quantity: 1,
            unitPrice: 164000,
            total: 164000,
            description: 'Sacred Sun 48V 100Ah Lithium Battery',
            itemId: availableItems[1].id
          }
        ]
      }
    }
  });

  // Update item status for partially paid item
  await prisma.item.update({
    where: { id: availableItems[1].id },
    data: {
      inventoryStatus: 'Sold',
      status: 'Sold',
      sellingPrice: 164000,
      outboundDate: new Date('2024-03-01'),
      customerId: createdCustomers[2].id
    }
  });

  console.log('✅ Invoices created');

  // Create Payments for invoices
  await prisma.payment.create({
    data: {
      paymentNumber: 'PAY-2024-001',
      paymentDate: new Date('2024-02-20'),
      amount: 198900,
      method: 'Bank Transfer',
      reference: 'TXN-20240220-AH001',
      notes: 'Full payment received',
      customerId: createdCustomers[1].id,
      invoiceId: invoice1.id,
      recordedById: adminUser.id
    }
  });

  await prisma.payment.create({
    data: {
      paymentNumber: 'PAY-2024-002',
      paymentDate: new Date('2024-03-05'),
      amount: 100000,
      method: 'Cash',
      notes: 'Partial payment - remaining balance due',
      customerId: createdCustomers[2].id,
      invoiceId: invoice2.id,
      recordedById: adminUser.id
    }
  });

  console.log('✅ Payments created');

  // Create some inventory movement history
  await prisma.inventoryMovement.create({
    data: {
      itemId: availableItems[0].id,
      movementType: 'SALE',
      fromStatus: 'In Store',
      toStatus: 'Sold',
      reference: 'INV-2024-001',
      notes: 'Sold to Ali Hassan',
      userId: adminUser.id
    }
  });

  await prisma.inventoryMovement.create({
    data: {
      itemId: availableItems[1].id,
      movementType: 'SALE',
      fromStatus: 'In Store',
      toStatus: 'Sold',
      reference: 'INV-2024-002',
      notes: 'Sold to Pak Solar Solutions',
      userId: adminUser.id
    }
  });

  console.log('✅ Inventory movements created');

  // Update customer balances
  await prisma.customer.update({
    where: { id: createdCustomers[1].id },
    data: { currentBalance: 25000 } // Opening balance maintained
  });

  await prisma.customer.update({
    where: { id: createdCustomers[2].id },
    data: { currentBalance: 91880 } // Total - paid amount
  });

  console.log('✅ Customer balances updated');

  console.log('\n========================================');
  console.log('✅ SEEDING COMPLETED SUCCESSFULLY!');
  console.log('========================================');
  console.log('\n📊 Summary:');
  console.log(`   - 3 Roles (Admin, Inventory Operator, Financial + Inventory Operator)`);
  console.log(`   - 3 Users (admin, inventory, operator)`);
  console.log(`   - 6 Product Categories`);
  console.log(`   - 7 Companies`);
  console.log(`   - ${createdModels.length} Product Models`);
  console.log(`   - ${createdVendors.length} Vendors`);
  console.log(`   - ${createdCustomers.length} Customers`);
  console.log(`   - ${createdItems.length} Inventory Items`);
  console.log(`   - 2 Purchase Orders (1 Completed, 1 Partial)`);
  console.log(`   - 2 Bills (1 Paid, 1 Unpaid)`);
  console.log(`   - 2 Invoices (1 Paid, 1 Partial)`);
  console.log(`   - 3 Payments (1 vendor, 2 customer)`);
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