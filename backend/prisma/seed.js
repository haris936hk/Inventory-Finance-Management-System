// Comprehensive local development seed.
//
// This intentionally recreates the local demo database on every run so that
// `npm run db:seed` always produces a complete, predictable dataset.
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const round = (value, places = 2) => Number(Number(value).toFixed(places));
const numeric = (value) => (
  value && typeof value.toNumber === 'function' ? value.toNumber() : Number(value)
);
const daysAgo = (days, hour = 10) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, 0, 0, 0);
  return date;
};
const iso = (date) => new Date(date).toISOString();

const allPermissions = [
  'inventory.view', 'inventory.create', 'inventory.edit', 'inventory.delete',
  'finance.view', 'finance.create', 'finance.edit', 'finance.delete',
  'reports.view', 'reports.export',
  'users.view', 'users.create', 'users.edit', 'users.delete',
  'roles.view', 'roles.create', 'roles.edit', 'roles.delete',
  'settings.view', 'settings.edit'
];

async function resetDatabase(tx) {
  // Delete children before parents because this seed is deliberately complete
  // and is intended for a disposable local development database.
  await tx.invoicePaymentAudit.deleteMany();
  await tx.pOBillAudit.deleteMany();
  await tx.inventoryStatusHistory.deleteMany();
  await tx.inventoryMovement.deleteMany();
  await tx.payment.deleteMany();
  await tx.vendorPayment.deleteMany();
  await tx.invoiceItem.deleteMany();
  await tx.customerLedger.deleteMany();
  await tx.vendorLedger.deleteMany();
  await tx.bill.deleteMany();
  await tx.invoice.deleteMany();
  await tx.item.deleteMany();
  await tx.purchaseOrderItem.deleteMany();
  await tx.purchaseOrder.deleteMany();
  await tx.productModel.deleteMany();
  await tx.productCategory.deleteMany();
  await tx.company.deleteMany();
  await tx.customer.deleteMany();
  await tx.vendor.deleteMany();
  await tx.user.deleteMany();
  await tx.role.deleteMany();
  await tx.systemSettings.deleteMany();
}

async function main() {
  console.log('🌱 Recreating the local database with comprehensive demo data...');

  const result = await prisma.$transaction(async (tx) => {
    await resetDatabase(tx);

    const roleSpecs = [
      {
        name: 'Admin',
        description: 'Full system access for administrators',
        permissions: allPermissions
      },
      {
        name: 'Inventory + Finance Manager',
        description: 'Can operate inventory and finance workflows, with reporting access',
        permissions: allPermissions.filter((permission) => !permission.startsWith('roles.') && !permission.startsWith('users.delete'))
      },
      {
        name: 'Inventory Operator',
        description: 'Receives stock, manages item status, and views inventory reports',
        permissions: [
          'inventory.view', 'inventory.create', 'inventory.edit',
          'reports.view', 'reports.export'
        ]
      },
      {
        name: 'Finance Operator',
        description: 'Creates invoices, bills, payments, and finance reports',
        permissions: [
          'inventory.view', 'finance.view', 'finance.create', 'finance.edit',
          'reports.view', 'reports.export'
        ]
      },
      {
        name: 'Viewer',
        description: 'Read-only access to operational dashboards and reports',
        permissions: ['inventory.view', 'finance.view', 'reports.view']
      }
    ];

    const roles = {};
    for (const spec of roleSpecs) roles[spec.name] = await tx.role.create({ data: spec });

    const userSpecs = [
      { username: 'admin', fullName: 'System Administrator', email: 'admin@khanpowersolutions.local', phone: '03001234001', role: 'Admin', password: 'admin123' },
      { username: 'ayesha.malik', fullName: 'Ayesha Malik', email: 'ayesha.malik@khanpowersolutions.local', phone: '03001234002', role: 'Inventory + Finance Manager', password: 'demo123' },
      { username: 'bilal.ahmed', fullName: 'Bilal Ahmed', email: 'bilal.ahmed@khanpowersolutions.local', phone: '03001234003', role: 'Inventory Operator', password: 'demo123' },
      { username: 'fatima.khan', fullName: 'Fatima Khan', email: 'fatima.khan@khanpowersolutions.local', phone: '03001234004', role: 'Finance Operator', password: 'demo123' },
      { username: 'hassan.raza', fullName: 'Hassan Raza', email: 'hassan.raza@khanpowersolutions.local', phone: '03001234005', role: 'Finance Operator', password: 'demo123' },
      { username: 'sara.iqbal', fullName: 'Sara Iqbal', email: 'sara.iqbal@khanpowersolutions.local', phone: '03001234006', role: 'Viewer', password: 'demo123' }
    ];
    const users = {};
    for (const spec of userSpecs) {
      users[spec.username] = await tx.user.create({
        data: {
          username: spec.username,
          password: await bcrypt.hash(spec.password, 10),
          fullName: spec.fullName,
          email: spec.email,
          phone: spec.phone,
          isActive: true,
          lastLogin: spec.username === 'admin' ? new Date() : daysAgo(1),
          roleId: roles[spec.role].id
        }
      });
    }

    const categorySpecs = [
      { name: 'Lithium Battery', code: 'LB', description: 'Lithium-ion battery modules for telecom and backup power', specTemplate: { voltage: 'V', capacity: 'Ah', chemistry: 'LFP', warrantyMonths: 24 } },
      { name: 'Rectifier Module', code: 'RM', description: 'AC/DC rectifier modules for telecom power systems', specTemplate: { inputVoltage: 'VAC', outputVoltage: 'VDC', outputCurrent: 'A', efficiency: '%' } },
      { name: 'Rectifier Back Plane', code: 'RBP', description: 'Back planes and distribution frames for rectifier shelves', specTemplate: { shelfSize: 'slots', busbarRating: 'A', compatibleSystem: 'text', warrantyMonths: 12 } },
      { name: 'Solar Controller', code: 'SC', description: 'MPPT solar charge controllers for hybrid power systems', specTemplate: { maxPVVoltage: 'V', maxChargeCurrent: 'A', batteryVoltage: 'V', mpptChannels: 'count' } },
      { name: 'Solar Panel', code: 'SP', description: 'High-efficiency photovoltaic modules', specTemplate: { ratedPower: 'W', openCircuitVoltage: 'V', shortCircuitCurrent: 'A', cellType: 'text' } },
      { name: 'Solar Inverter', code: 'SI', description: 'Grid and hybrid solar inverters', specTemplate: { ratedPower: 'kW', maxEfficiency: '%', mpptTrackers: 'count', phase: 'text' } }
    ];
    const categories = {};
    for (const spec of categorySpecs) categories[spec.name] = await tx.productCategory.create({ data: spec });

    const companySpecs = [
      { name: 'Vision', code: 'VIS', description: 'Vision Group battery and energy storage products', contactPerson: 'Wang Lei', email: 'sales@vision-energy.local', phone: '+86 21 5550 1100', address: 'Shanghai, China', website: 'https://www.vision-group.local' },
      { name: 'Sacred Sun', code: 'SSN', description: 'Industrial batteries and telecom power solutions', contactPerson: 'Zhang Min', email: 'export@sacred-sun.local', phone: '+86 531 5550 2200', address: 'Jinan, China', website: 'https://www.sacred-sun.local' },
      { name: 'Narada', code: 'NAR', description: 'Energy storage and critical power systems', contactPerson: 'Liang Chen', email: 'partners@narada.local', phone: '+86 571 5550 3300', address: 'Hangzhou, China', website: 'https://www.narada.local' },
      { name: 'Vertiv', code: 'VRT', description: 'Data center and telecom infrastructure products', contactPerson: 'Michael Brooks', email: 'channel@vertiv.local', phone: '+1 614 555 4400', address: 'Columbus, Ohio, USA', website: 'https://www.vertiv.local' },
      { name: 'Huawei', code: 'HUA', description: 'Digital power and renewable energy equipment', contactPerson: 'Chen Wei', email: 'enterprise@huawei.local', phone: '+86 755 5550 5500', address: 'Shenzhen, China', website: 'https://www.huawei.local' },
      { name: 'Schneider Electric', code: 'SNE', description: 'Energy management and industrial automation equipment', contactPerson: 'Claire Martin', email: 'distribution@schneider.local', phone: '+33 1 5550 6600', address: 'Rueil-Malmaison, France', website: 'https://www.schneider-electric.local' }
    ];
    const companies = {};
    for (const spec of companySpecs) companies[spec.name] = await tx.company.create({ data: spec });

    const modelSpecs = [
      { name: 'V-LFP48100', code: 'VIS-LFP48100', category: 'Lithium Battery', company: 'Vision', description: '48V 100Ah lithium iron phosphate battery module' },
      { name: 'V-LFP48200', code: 'VIS-LFP48200', category: 'Lithium Battery', company: 'Vision', description: '48V 200Ah high-capacity lithium battery module' },
      { name: 'SS-12V200', code: 'SS-12V200', category: 'Lithium Battery', company: 'Sacred Sun', description: '12V 200Ah industrial battery module' },
      { name: 'NAR-LFP48100', code: 'NAR-LFP48100', category: 'Lithium Battery', company: 'Narada', description: '48V 100Ah telecom lithium battery module' },
      { name: 'R48-2000E3', code: 'VRT-R48-2000', category: 'Rectifier Module', company: 'Vertiv', description: '48V 2kW high-efficiency rectifier module' },
      { name: 'R48-3000C', code: 'VRT-R48-3000', category: 'Rectifier Module', company: 'Vertiv', description: '48V 3kW telecom rectifier module' },
      { name: 'ETP48200', code: 'HUA-ETP48200', category: 'Rectifier Module', company: 'Huawei', description: '48V 2kW embedded power rectifier' },
      { name: 'NetSure 7100', code: 'VRT-NS7100', category: 'Rectifier Back Plane', company: 'Vertiv', description: 'Six-slot rectifier shelf and back plane' },
      { name: 'ETP48300 Backplane', code: 'HUA-ETP-BP', category: 'Rectifier Back Plane', company: 'Huawei', description: 'Modular back plane for ETP48 series' },
      { name: 'Conext MPPT 80', code: 'SNE-MPPT80', category: 'Solar Controller', company: 'Schneider Electric', description: '80A MPPT solar charge controller' },
      { name: 'SUN2000-60KTL', code: 'HUA-SUN2000-60', category: 'Solar Inverter', company: 'Huawei', description: '60kW three-phase string inverter' },
      { name: 'Conext XW Pro', code: 'SNE-XW-PRO', category: 'Solar Inverter', company: 'Schneider Electric', description: 'Hybrid inverter for commercial backup systems' },
      { name: 'HiKu6 550W', code: 'SP-CAN-550', category: 'Solar Panel', company: 'Huawei', description: '550W monocrystalline photovoltaic panel' },
      { name: 'Vertex S+ 450W', code: 'SP-TRI-450', category: 'Solar Panel', company: 'Schneider Electric', description: '450W high-density rooftop photovoltaic panel' }
    ];
    const models = [];
    for (const spec of modelSpecs) {
      const model = await tx.productModel.create({
        data: {
          name: spec.name,
          code: spec.code,
          description: spec.description,
          categoryId: categories[spec.category].id,
          companyId: companies[spec.company].id
        }
      });
      models.push({ ...model, categoryName: spec.category, companyName: spec.company });
    }
    const modelByName = Object.fromEntries(models.map((model) => [model.name, model]));

    const vendorSpecs = [
      { name: 'PowerTech Imports', code: 'VEN-001', contactPerson: 'Usman Tariq', email: 'usman@powertech.local', phone: '042-5550101', address: 'Hall Road, Lahore', taxNumber: '3278901-8', paymentTerms: '30 days', openingBalance: 185000 },
      { name: 'Green Energy Solutions', code: 'VEN-002', contactPerson: 'Nadia Sheikh', email: 'nadia@greenenergy.local', phone: '051-5550102', address: 'Blue Area, Islamabad', taxNumber: '4589210-4', paymentTerms: '45 days', openingBalance: 0 },
      { name: 'Telecom Systems Pakistan', code: 'VEN-003', contactPerson: 'Kamran Yousaf', email: 'kamran@tsp.local', phone: '021-5550103', address: 'Shahrah-e-Faisal, Karachi', taxNumber: '2198734-2', paymentTerms: '30 days', openingBalance: 92000 },
      { name: 'KPS Direct Trading', code: 'VEN-004', contactPerson: 'Mariam Riaz', email: 'mariam@kpsdirect.local', phone: '042-5550104', address: 'Gulberg III, Lahore', taxNumber: '5412098-7', paymentTerms: '15 days', openingBalance: 0 },
      { name: 'Industrial Power House', code: 'VEN-005', contactPerson: 'Adnan Shah', email: 'adnan@iph.local', phone: '091-5550105', address: 'University Road, Peshawar', taxNumber: '6789012-1', paymentTerms: '60 days', openingBalance: 240000 },
      { name: 'Solar Hub Distribution', code: 'VEN-006', contactPerson: 'Hina Aslam', email: 'hina@solarhub.local', phone: '042-5550106', address: 'Ferozepur Road, Lahore', taxNumber: '7345601-9', paymentTerms: '30 days', openingBalance: 45000 },
      { name: 'Critical Power Supplies', code: 'VEN-007', contactPerson: 'Faisal Noor', email: 'faisal@criticalpower.local', phone: '021-5550107', address: 'Korangi Industrial Area, Karachi', taxNumber: '8901234-5', paymentTerms: '30 days', openingBalance: 0 },
      { name: 'Renewable Equipment Co.', code: 'VEN-008', contactPerson: 'Sana Khalid', email: 'sana@renewableeq.local', phone: '051-5550108', address: 'I-9 Industrial Area, Islamabad', taxNumber: '9012345-6', paymentTerms: '45 days', openingBalance: 73500 }
    ];
    const vendors = {};
    for (const spec of vendorSpecs) vendors[spec.name] = await tx.vendor.create({ data: spec });

    const customerSpecs = [
      { name: 'Metro Telecom Services', email: 'accounts@metrotelecom.local', phone: '03011234001', address: 'DHA Phase 5, Lahore', nic: '35202-1234501-1', company: 'Metro Telecom', creditLimit: 2500000, openingBalance: 175000 },
      { name: 'Pak Fiber Networks', email: 'finance@pakfiber.local', phone: '03011234002', address: 'Clifton, Karachi', nic: '42201-2345602-2', company: 'Pak Fiber Networks', creditLimit: 1800000, openingBalance: 0 },
      { name: 'Northern Power Projects', email: 'billing@npp.local', phone: '03011234003', address: 'F-8, Islamabad', nic: '61101-3456703-3', company: 'Northern Power Projects', creditLimit: 3500000, openingBalance: 325000 },
      { name: 'City Data Centers', email: 'procurement@citydc.local', phone: '03011234004', address: 'Gulberg II, Lahore', nic: '35202-4567804-4', company: 'City Data Centers', creditLimit: 4200000, openingBalance: 0 },
      { name: 'Frontier Communications', email: 'accounts@frontiercom.local', phone: '03011234005', address: 'Hayatabad, Peshawar', nic: '17301-5678905-5', company: 'Frontier Communications', creditLimit: 1200000, openingBalance: 85000 },
      { name: 'Sunrise Solar Farms', email: 'finance@sunrisefarms.local', phone: '03011234006', address: 'Bahawalpur Road, Multan', nic: '36101-6789006-6', company: 'Sunrise Solar Farms', creditLimit: 3000000, openingBalance: 0 },
      { name: 'Al-Hayat Industries', email: 'admin@alhayat.local', phone: '03011234007', address: 'SITE Area, Karachi', nic: '42201-7890107-7', company: 'Al-Hayat Industries', creditLimit: 1500000, openingBalance: 110000 },
      { name: 'Capital IT Park', email: 'purchase@capitalit.local', phone: '03011234008', address: 'I-10, Islamabad', nic: '61101-8901208-8', company: 'Capital IT Park', creditLimit: 2700000, openingBalance: 0 },
      { name: 'Vertex Mobile', email: 'accounts@vertexmobile.local', phone: '03011234009', address: 'Johar Town, Lahore', nic: '35202-9012309-9', company: 'Vertex Mobile', creditLimit: 2100000, openingBalance: 0 },
      { name: 'Blue Horizon Energy', email: 'finance@bluehorizon.local', phone: '03011234010', address: 'PECHS, Karachi', nic: '42201-0123410-0', company: 'Blue Horizon Energy', creditLimit: 1950000, openingBalance: 50000 },
      { name: 'Sapphire Manufacturing', email: 'procurement@sapphiremfg.local', phone: '03011234011', address: 'Sundar Industrial Estate, Lahore', nic: '35202-1234511-1', company: 'Sapphire Manufacturing', creditLimit: 1650000, openingBalance: 0 },
      { name: 'Eastern Grid Contractors', email: 'accounts@easterngrid.local', phone: '03011234012', address: 'Satellite Town, Rawalpindi', nic: '61101-2345612-2', company: 'Eastern Grid Contractors', creditLimit: 2400000, openingBalance: 210000 }
    ];
    const customers = {};
    for (const spec of customerSpecs) customers[spec.name] = await tx.customer.create({ data: spec });
    const customerList = Object.values(customers);

    const poSpecs = [
      { number: 'PO-2026-0001', vendor: 'PowerTech Imports', status: 'Draft', days: 3, lines: [{ model: 'V-LFP48100', quantity: 6, price: 280000 }, { model: 'R48-2000E3', quantity: 8, price: 145000 }] },
      { number: 'PO-2026-0002', vendor: 'Green Energy Solutions', status: 'Partial', days: 18, lines: [{ model: 'Conext MPPT 80', quantity: 10, price: 95000 }, { model: 'HiKu6 550W', quantity: 30, price: 52000 }] },
      { number: 'PO-2026-0003', vendor: 'Telecom Systems Pakistan', status: 'Paid', days: 32, lines: [{ model: 'NetSure 7100', quantity: 4, price: 365000 }, { model: 'ETP48200', quantity: 12, price: 185000 }] },
      { number: 'PO-2026-0004', vendor: 'Industrial Power House', status: 'Delivered', days: 47, lines: [{ model: 'V-LFP48200', quantity: 5, price: 430000 }, { model: 'SUN2000-60KTL', quantity: 3, price: 725000 }] },
      { number: 'PO-2026-0005', vendor: 'Solar Hub Distribution', status: 'Sent', days: 9, lines: [{ model: 'Vertex S+ 450W', quantity: 24, price: 45500 }, { model: 'Conext XW Pro', quantity: 4, price: 560000 }] },
      { number: 'PO-2026-0006', vendor: 'Critical Power Supplies', status: 'Cancelled', days: 61, lines: [{ model: 'SS-12V200', quantity: 20, price: 68000 }] },
      { number: 'PO-2026-0007', vendor: 'Renewable Equipment Co.', status: 'Partial', days: 24, lines: [{ model: 'NAR-LFP48100', quantity: 8, price: 295000 }, { model: 'ETP48300 Backplane', quantity: 5, price: 210000 }] },
      { number: 'PO-2026-0008', vendor: 'PowerTech Imports', status: 'Delivered', days: 75, lines: [{ model: 'R48-3000C', quantity: 10, price: 195000 }, { model: 'SUN2000-60KTL', quantity: 2, price: 725000 }] }
    ];
    const purchaseOrders = [];
    for (const spec of poSpecs) {
      const lineDrafts = spec.lines.map((line) => ({ ...line, totalPrice: round(line.quantity * line.price) }));
      const subtotal = round(lineDrafts.reduce((sum, line) => sum + line.totalPrice, 0));
      const taxAmount = round(subtotal * 0.18);
      const po = await tx.purchaseOrder.create({
        data: {
          poNumber: spec.number,
          orderDate: daysAgo(spec.days),
          expectedDate: daysAgo(Math.max(spec.days - 7, 0)),
          status: spec.status,
          subtotal,
          taxAmount,
          total: round(subtotal + taxAmount),
          vendorId: vendors[spec.vendor].id,
          receivedQuantities: {}
        }
      });
      const lineItems = [];
      for (const line of lineDrafts) {
        const model = modelByName[line.model];
        lineItems.push(await tx.purchaseOrderItem.create({
          data: {
            description: `${model.companyName} ${model.name}`,
            quantity: line.quantity,
            unitPrice: line.price,
            totalPrice: line.totalPrice,
            specifications: { modelCode: model.code, source: 'seed', requestedBy: 'Procurement' },
            notes: `Demo purchase line for ${spec.number}`,
            purchaseOrderId: po.id,
            productModelId: model.id
          }
        }));
      }
      const receivedQuantities = {};
      lineItems.forEach((line) => {
        receivedQuantities[line.id] = spec.status === 'Delivered'
          ? line.quantity : spec.status === 'Partial' ? Math.max(1, Math.floor(line.quantity * 0.45)) : 0;
      });
      const updated = await tx.purchaseOrder.update({ where: { id: po.id }, data: { receivedQuantities } });
      purchaseOrders.push({ ...updated, vendorName: spec.vendor, lineItems });
    }
    const poByNumber = Object.fromEntries(purchaseOrders.map((po) => [po.poNumber, po]));

    const billSpecs = [
      { number: 'BILL-2026-0001', po: 'PO-2026-0002', status: 'Partial', share: 0.5, paidShare: 0.5, days: 14 },
      { number: 'BILL-2026-0002', po: 'PO-2026-0003', status: 'Paid', share: 1, paidShare: 1, days: 25 },
      { number: 'BILL-2026-0003', po: 'PO-2026-0004', status: 'Paid', share: 1, paidShare: 1, days: 39 },
      { number: 'BILL-2026-0004', po: 'PO-2026-0005', status: 'Unpaid', share: 0.6, paidShare: 0, days: 5 },
      { number: 'BILL-2026-0005', po: 'PO-2026-0005', status: 'Unpaid', share: 0.4, paidShare: 0, days: 4 },
      { number: 'BILL-2026-0006', po: 'PO-2026-0007', status: 'Partial', share: 0.75, paidShare: 0.4, days: 18 },
      { number: 'BILL-2026-0007', po: 'PO-2026-0008', status: 'Paid', share: 1, paidShare: 1, days: 63 }
    ];
    const bills = [];
    for (const spec of billSpecs) {
      const po = poByNumber[spec.po];
      const total = round(numeric(po.total) * spec.share);
      const subtotal = round(total / 1.18);
      const taxAmount = round(total - subtotal);
      const bill = await tx.bill.create({
        data: {
          billNumber: spec.number,
          billDate: daysAgo(spec.days),
          dueDate: daysAgo(spec.days - 30),
          status: spec.status,
          subtotal,
          taxAmount,
          total,
          paidAmount: round(total * spec.paidShare),
          vendorId: po.vendorId,
          purchaseOrderId: po.id
        }
      });
      bills.push({ ...bill, poNumber: po.poNumber, vendorName: po.vendorName });
    }
    for (const po of purchaseOrders) {
      const billedAmount = bills.filter((bill) => bill.purchaseOrderId === po.id).reduce((sum, bill) => sum + numeric(bill.total), 0);
      await tx.purchaseOrder.update({ where: { id: po.id }, data: { billedAmount: round(billedAmount) } });
    }

    // Create stock before invoicing so invoices can reference real inventory.
    const receivingPOs = purchaseOrders.filter((po) => !['Draft', 'Cancelled'].includes(po.status));
    const items = [];
    for (let index = 0; index < 36; index += 1) {
      const inventoryStatus = index < 14 ? 'Available' : index < 19 ? 'Reserved' : index < 26 ? 'Sold' : index < 30 ? 'Delivered' : index < 33 ? 'Under Repair' : 'Returned';
      const physicalStatus = inventoryStatus === 'Under Repair' ? 'In Lab' : inventoryStatus === 'Delivered' ? 'Handover' : 'In Store';
      const model = models[index % models.length];
      const purchaseDate = daysAgo(80 - index);
      const isOutbound = ['Sold', 'Delivered', 'Returned'].includes(inventoryStatus);
      const customer = isOutbound || inventoryStatus === 'Reserved' ? customerList[(index + 1) % customerList.length] : null;
      const purchasePrice = round(45000 + ((index * 17350) % 680000));
      const sellingPrice = isOutbound || inventoryStatus === 'Reserved' ? round(purchasePrice * (1.22 + ((index % 4) * 0.04))) : null;
      const outboundDate = isOutbound ? daysAgo(Math.max(2, 42 - index)) : null;
      const serialNumber = `KPS-${model.code}-${String(index + 1).padStart(4, '0')}`;
      const handover = inventoryStatus === 'Delivered' || inventoryStatus === 'Returned';
      const item = await tx.item.create({
        data: {
          serialNumber,
          condition: inventoryStatus === 'Returned' ? 'Used - Returned' : inventoryStatus === 'Under Repair' ? 'Used - Repair Required' : 'New',
          inventoryStatus,
          status: physicalStatus,
          statusHistory: [{ status: 'Available', date: iso(purchaseDate), notes: 'Received into warehouse during initial stock intake' }],
          repaired: inventoryStatus === 'Under Repair' ? 'Pending diagnostics' : inventoryStatus === 'Returned' ? 'Inspection required' : 'No repair required',
          specifications: { model: model.name, modelCode: model.code, category: model.categoryName, manufacturer: model.companyName, warehouseBin: `BIN-${String((index % 12) + 1).padStart(2, '0')}`, batch: `BATCH-2026-${String((index % 6) + 1).padStart(2, '0')}` },
          purchasePrice,
          purchaseDate,
          inboundDate: purchaseDate,
          sellingPrice,
          outboundDate,
          customerId: customer ? customer.id : null,
          handoverTo: handover ? customer.name : null,
          handoverToNIC: handover ? customer.nic : null,
          handoverToPhone: handover ? customer.phone : null,
          handoverBy: handover ? users['bilal.ahmed'].fullName : null,
          handoverById: handover ? users['bilal.ahmed'].id : null,
          handoverDetails: handover ? JSON.stringify({ deliveryNote: `DN-2026-${String(index + 1).padStart(4, '0')}`, receivedBy: customer.name }) : null,
          handoverDate: handover ? outboundDate : null,
          categoryId: categories[model.categoryName].id,
          modelId: model.id,
          vendorId: receivingPOs[index % receivingPOs.length].vendorId,
          purchaseOrderId: receivingPOs[index % receivingPOs.length].id,
          createdById: users['bilal.ahmed'].id
        }
      });
      items.push({ ...item, modelName: model.name, inventoryStatus, physicalStatus });
    }

    const available = items.filter((item) => item.inventoryStatus === 'Available');
    const reserved = items.filter((item) => item.inventoryStatus === 'Reserved');
    const sold = items.filter((item) => item.inventoryStatus === 'Sold');
    const delivered = items.filter((item) => item.inventoryStatus === 'Delivered');
    const invoiceSpecs = [
      { number: 'INV-2026-0001', customer: 'Metro Telecom Services', status: 'Draft', days: 2, items: available.slice(0, 2), paidRatio: 0, discountType: null, discountValue: 0 },
      { number: 'INV-2026-0002', customer: 'Pak Fiber Networks', status: 'Sent', days: 8, items: reserved.slice(0, 2), paidRatio: 0, discountType: 'Percentage', discountValue: 5 },
      { number: 'INV-2026-0003', customer: 'Northern Power Projects', status: 'Partial', days: 21, items: reserved.slice(2, 4), paidRatio: 0.45, discountType: null, discountValue: 0 },
      { number: 'INV-2026-0004', customer: 'City Data Centers', status: 'Paid', days: 35, items: sold.slice(0, 2), paidRatio: 1, discountType: 'Fixed', discountValue: 25000 },
      { number: 'INV-2026-0005', customer: 'Frontier Communications', status: 'Overdue', days: 70, items: sold.slice(2, 4), paidRatio: 0, discountType: null, discountValue: 0 },
      { number: 'INV-2026-0006', customer: 'Al-Hayat Industries', status: 'Cancelled', days: 55, items: available.slice(2, 3), paidRatio: 0, discountType: null, discountValue: 0 },
      { number: 'INV-2026-0007', customer: 'Sunrise Solar Farms', status: 'Paid', days: 48, items: delivered.slice(0, 2), paidRatio: 1, discountType: 'Percentage', discountValue: 3 },
      { number: 'INV-2026-0008', customer: 'Capital IT Park', status: 'Sent', days: 12, items: reserved.slice(4, 5), paidRatio: 0, discountType: null, discountValue: 0 }
    ];
    const invoices = [];
    for (const spec of invoiceSpecs) {
      const lineDrafts = spec.items.map((item) => {
        const unitPrice = numeric(item.sellingPrice || item.purchasePrice);
        return { item, unitPrice: round(unitPrice), total: round(unitPrice), description: `${item.modelName} / ${item.serialNumber}` };
      });
      const subtotal = round(lineDrafts.reduce((sum, line) => sum + line.total, 0));
      const discountAmount = spec.discountType === 'Percentage' ? round(subtotal * spec.discountValue / 100) : round(spec.discountValue);
      const taxableSubtotal = round(subtotal - discountAmount);
      const taxAmount = round(taxableSubtotal * 0.18);
      const total = round(taxableSubtotal + taxAmount);
      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber: spec.number,
          invoiceDate: daysAgo(spec.days),
          dueDate: daysAgo(spec.days - 30),
          status: spec.status,
          subtotal,
          discountType: spec.discountType,
          discountValue: spec.discountValue,
          taxType: 'GST',
          taxRate: 18,
          taxAmount,
          total,
          paidAmount: round(total * spec.paidRatio),
          terms: 'Payment due within 30 days of invoice date. Goods remain property of KPS until payment is cleared.',
          notes: `Seeded ${spec.status.toLowerCase()} invoice for local development and reporting tests.`,
          cancelledAt: spec.status === 'Cancelled' ? daysAgo(spec.days - 1) : null,
          cancelledBy: spec.status === 'Cancelled' ? users.admin.id : null,
          customerId: customers[spec.customer].id,
          createdById: users['fatima.khan'].id
        }
      });
      const createdLines = [];
      for (const line of lineDrafts) {
        const createdLine = await tx.invoiceItem.create({ data: { quantity: 1, unitPrice: line.unitPrice, total: line.total, description: line.description, invoiceId: invoice.id, itemId: line.item.id } });
        createdLines.push(createdLine);
      }
      invoices.push({ ...invoice, customerName: spec.customer, lineItems: createdLines });
    }
    const invoiceByNumber = Object.fromEntries(invoices.map((invoice) => [invoice.invoiceNumber, invoice]));
    const itemInvoice = {};
    for (const invoice of invoices) for (const line of invoice.lineItems) itemInvoice[line.itemId] = invoice;

    const payments = [];
    for (const invoice of invoices) {
      const totalPaid = numeric(invoice.paidAmount);
      if (totalPaid > 0) {
        const split = invoice.invoiceNumber === 'INV-2026-0007' ? [round(totalPaid * 0.6), round(totalPaid * 0.4)] : [totalPaid];
        split.forEach((amount, index) => payments.push({ paymentNumber: `PAY-2026-${String(payments.length + 1).padStart(4, '0')}`, paymentDate: daysAgo(Math.max(1, 28 - index * 4)), amount, method: index === 0 ? 'Bank Transfer' : 'Cheque', reference: `RCPT-${invoice.invoiceNumber.slice(-4)}-${index + 1}`, notes: `Customer payment ${index + 1} for ${invoice.invoiceNumber}`, customerId: invoice.customerId, invoiceId: invoice.id, recordedById: users['fatima.khan'].id }));
      }
    }
    const voidedInvoice = invoiceByNumber['INV-2026-0002'];
    payments.push({ paymentNumber: `PAY-2026-${String(payments.length + 1).padStart(4, '0')}`, paymentDate: daysAgo(6), amount: 45000, method: 'Cash', reference: 'VOID-TEST-0001', notes: 'Voided duplicate receipt retained for audit testing.', customerId: voidedInvoice.customerId, invoiceId: voidedInvoice.id, voidedAt: daysAgo(4), voidedBy: users.admin.id, recordedById: users['hassan.raza'].id });
    const createdPayments = [];
    for (const payment of payments) createdPayments.push(await tx.payment.create({ data: payment }));

    const vendorPayments = [];
    for (const bill of bills) {
      const paidAmount = numeric(bill.paidAmount);
      if (paidAmount <= 0) continue;
      vendorPayments.push(await tx.vendorPayment.create({ data: { paymentNumber: `VPAY-2026-${String(vendorPayments.length + 1).padStart(4, '0')}`, paymentDate: daysAgo(20 - vendorPayments.length * 3), amount: paidAmount, method: vendorPayments.length % 2 === 0 ? 'Bank Transfer' : 'Cheque', reference: `VRCPT-${bill.billNumber.slice(-4)}`, notes: `Vendor settlement for ${bill.billNumber}`, vendorId: bill.vendorId, billId: bill.id, createdBy: users['fatima.khan'].id } }));
    }
    vendorPayments.push(await tx.vendorPayment.create({ data: { paymentNumber: `VPAY-2026-${String(vendorPayments.length + 1).padStart(4, '0')}`, paymentDate: daysAgo(11), amount: 30000, method: 'Cash', reference: 'VOID-VENDOR-0001', notes: 'Voided duplicate vendor payment for reconciliation testing.', vendorId: bills[1].vendorId, billId: bills[1].id, createdBy: users['hassan.raza'].id, voidedAt: daysAgo(9), voidedBy: users.admin.id } }));

    for (const customer of customerList) {
      let balance = numeric(customer.openingBalance);
      await tx.customerLedger.create({ data: { entryDate: daysAgo(90), description: 'Opening customer balance', debit: balance, credit: 0, balance, customerId: customer.id } });
      const customerInvoices = invoices.filter((invoice) => invoice.customerId === customer.id && invoice.status !== 'Cancelled').sort((a, b) => new Date(a.invoiceDate) - new Date(b.invoiceDate));
      for (const invoice of customerInvoices) {
        const total = numeric(invoice.total);
        balance = round(balance + total);
        await tx.customerLedger.create({ data: { entryDate: invoice.invoiceDate, description: `Invoice ${invoice.invoiceNumber}`, debit: total, credit: 0, balance, customerId: customer.id, invoiceId: invoice.id } });
        for (const payment of createdPayments.filter((candidate) => candidate.invoiceId === invoice.id && !candidate.voidedAt)) {
          balance = round(balance - numeric(payment.amount));
          await tx.customerLedger.create({ data: { entryDate: payment.paymentDate, description: `Payment ${payment.paymentNumber}`, debit: 0, credit: numeric(payment.amount), balance, customerId: customer.id, invoiceId: invoice.id } });
        }
      }
    }

    const allVendors = Object.values(vendors);
    for (const vendor of allVendors) {
      let balance = numeric(vendor.openingBalance);
      await tx.vendorLedger.create({ data: { entryDate: daysAgo(90), description: 'Opening vendor balance', debit: 0, credit: balance, balance, vendorId: vendor.id } });
      const vendorBills = bills.filter((bill) => bill.vendorId === vendor.id).sort((a, b) => new Date(a.billDate) - new Date(b.billDate));
      for (const bill of vendorBills) {
        balance = round(balance + numeric(bill.total));
        await tx.vendorLedger.create({ data: { entryDate: bill.billDate, description: `Bill ${bill.billNumber}`, debit: 0, credit: numeric(bill.total), balance, vendorId: vendor.id, billId: bill.id } });
        for (const payment of vendorPayments.filter((candidate) => candidate.billId === bill.id && !candidate.voidedAt)) {
          balance = round(balance - numeric(payment.amount));
          await tx.vendorLedger.create({ data: { entryDate: payment.paymentDate, description: `Payment ${payment.paymentNumber}`, debit: numeric(payment.amount), credit: 0, balance, vendorId: vendor.id, billId: bill.id } });
        }
      }
    }

    for (const item of items) {
      const po = purchaseOrders.find((candidate) => candidate.id === item.purchaseOrderId);
      await tx.inventoryStatusHistory.create({ data: { itemId: item.id, fromStatus: null, toStatus: 'Available', changeReason: 'Initial stock receipt', referenceType: 'PurchaseOrder', referenceId: po ? po.id : null, changedBy: users['bilal.ahmed'].id, changeDate: item.purchaseDate, notes: `Item received against ${po ? po.poNumber : 'opening stock'}` } });
      if (item.inventoryStatus !== 'Available') {
        const invoice = itemInvoice[item.id];
        await tx.inventoryStatusHistory.create({ data: { itemId: item.id, fromStatus: item.inventoryStatus === 'Returned' ? 'Sold' : 'Available', toStatus: item.inventoryStatus, changeReason: item.inventoryStatus === 'Under Repair' ? 'Repair intake' : 'Operational status update', referenceType: invoice ? 'Invoice' : 'Manual', referenceId: invoice ? invoice.id : null, changedBy: users['ayesha.malik'].id, changeDate: item.outboundDate || daysAgo(10), notes: invoice ? `Linked to ${invoice.invoiceNumber}` : 'Seeded workflow state for testing' } });
      }
    }
    for (const item of items) {
      const po = purchaseOrders.find((candidate) => candidate.id === item.purchaseOrderId);
      await tx.inventoryMovement.create({ data: { itemId: item.id, movementType: 'PURCHASE_RECEIPT', fromStatus: null, toStatus: 'Available', quantity: 1, reference: po ? po.poNumber : 'OPENING-STOCK', notes: 'Initial warehouse receipt', userId: users['bilal.ahmed'].id, createdAt: item.purchaseDate } });
      if (item.inventoryStatus !== 'Available') {
        const invoice = itemInvoice[item.id];
        await tx.inventoryMovement.create({ data: { itemId: item.id, movementType: ['Sold', 'Delivered'].includes(item.inventoryStatus) ? 'SALE' : 'STATUS_CHANGE', fromStatus: item.inventoryStatus === 'Returned' ? 'Sold' : 'Available', toStatus: item.inventoryStatus, quantity: 1, reference: invoice ? invoice.invoiceNumber : `STATUS-${item.serialNumber}`, notes: invoice ? `Inventory movement for ${invoice.invoiceNumber}` : 'Seeded status movement', userId: users['ayesha.malik'].id, createdAt: item.outboundDate || daysAgo(10) } });
      }
    }

    for (const po of purchaseOrders) await tx.pOBillAudit.create({ data: { purchaseOrderId: po.id, action: 'STATUS_CHANGED', beforeState: { status: 'Draft' }, afterState: { status: po.status, poNumber: po.poNumber }, performedBy: users['ayesha.malik'].id, performedAt: po.orderDate, metadata: { source: 'seed', reason: 'Purchase order lifecycle sample' } } });
    for (const bill of bills) await tx.pOBillAudit.create({ data: { purchaseOrderId: bill.purchaseOrderId, billId: bill.id, action: 'BILL_CREATED', beforeState: null, afterState: { billNumber: bill.billNumber, total: numeric(bill.total), status: bill.status }, performedBy: users['fatima.khan'].id, performedAt: bill.billDate, metadata: { source: 'seed' } } });
    for (const payment of vendorPayments) {
      const bill = bills.find((candidate) => candidate.id === payment.billId);
      await tx.pOBillAudit.create({ data: { purchaseOrderId: bill.purchaseOrderId, billId: payment.billId, paymentId: payment.id, action: payment.voidedAt ? 'PAYMENT_VOIDED' : 'PAYMENT_RECORDED', beforeState: null, afterState: { paymentNumber: payment.paymentNumber, amount: numeric(payment.amount), voided: Boolean(payment.voidedAt) }, performedBy: payment.voidedAt ? users.admin.id : users['fatima.khan'].id, performedAt: payment.paymentDate, metadata: { source: 'seed' } } });
    }
    for (const invoice of invoices) {
      await tx.invoicePaymentAudit.create({ data: { invoiceId: invoice.id, action: 'INVOICE_CREATED', beforeState: null, afterState: { invoiceNumber: invoice.invoiceNumber, status: invoice.status, total: numeric(invoice.total) }, performedBy: invoice.createdById, performedAt: invoice.invoiceDate, metadata: { source: 'seed' } } });
      if (invoice.cancelledAt) await tx.invoicePaymentAudit.create({ data: { invoiceId: invoice.id, action: 'INVOICE_CANCELLED', beforeState: { status: 'Draft' }, afterState: { status: 'Cancelled', invoiceNumber: invoice.invoiceNumber }, performedBy: users.admin.id, performedAt: invoice.cancelledAt, metadata: { source: 'seed', reason: 'Cancellation workflow sample' } } });
    }
    for (const payment of createdPayments) await tx.invoicePaymentAudit.create({ data: { invoiceId: payment.invoiceId, paymentId: payment.id, action: payment.voidedAt ? 'PAYMENT_VOIDED' : 'PAYMENT_RECORDED', beforeState: null, afterState: { paymentNumber: payment.paymentNumber, amount: numeric(payment.amount), voided: Boolean(payment.voidedAt) }, performedBy: payment.voidedAt ? users.admin.id : payment.recordedById, performedAt: payment.paymentDate, metadata: { source: 'seed' } } });

    const settings = [
      { key: 'general', value: { companyName: 'Khan Power Solutions', companyShortName: 'KPS', currency: 'PKR', timezone: 'Asia/Karachi', dateFormat: 'DD/MM/YYYY', language: 'en', address: '22 Industrial Estate, Lahore, Pakistan', phone: '+92 42 555 7700', email: 'info@khanpowersolutions.local', taxRegistration: '3278901-8' } },
      { key: 'inventory', value: { defaultWarehouse: 'Lahore Main Warehouse', lowStockThreshold: 5, reorderThreshold: 10, defaultCondition: 'New', serialNumberPrefix: 'KPS-', bins: ['BIN-01', 'BIN-02', 'BIN-03', 'BIN-04', 'BIN-05', 'BIN-06', 'BIN-07', 'BIN-08', 'BIN-09', 'BIN-10', 'BIN-11', 'BIN-12'] } },
      { key: 'finance', value: { defaultTaxType: 'GST', defaultTaxRate: 18, defaultPaymentTermsDays: 30, fiscalYearStartMonth: 7, invoicePrefix: 'INV-', billPrefix: 'BILL-', paymentPrefix: 'PAY-', decimalPlaces: 2, enableCreditLimit: true } },
      { key: 'notifications', value: { lowStockAlerts: true, overdueInvoiceAlerts: true, overdueBillAlerts: true, dailySummary: true, summaryRecipients: ['admin@khanpowersolutions.local', 'ayesha.malik@khanpowersolutions.local'] } },
      { key: 'backup', value: { enabled: true, frequency: 'daily', retentionDays: 30, lastBackup: iso(daysAgo(1, 2)), storage: 'local-development', encryption: false } }
    ];
    for (const setting of settings) await tx.systemSettings.create({ data: setting });

    const countModels = [
      ['roles', tx.role], ['users', tx.user], ['categories', tx.productCategory], ['companies', tx.company], ['models', tx.productModel], ['items', tx.item], ['vendors', tx.vendor], ['customers', tx.customer], ['purchaseOrders', tx.purchaseOrder], ['purchaseOrderItems', tx.purchaseOrderItem], ['bills', tx.bill], ['invoices', tx.invoice], ['invoiceItems', tx.invoiceItem], ['payments', tx.payment], ['vendorPayments', tx.vendorPayment], ['customerLedgerEntries', tx.customerLedger], ['vendorLedgerEntries', tx.vendorLedger], ['inventoryMovements', tx.inventoryMovement], ['inventoryStatusHistory', tx.inventoryStatusHistory], ['poBillAudits', tx.pOBillAudit], ['invoicePaymentAudits', tx.invoicePaymentAudit], ['systemSettings', tx.systemSettings]
    ];
    const summary = {};
    for (const [name, delegate] of countModels) summary[name] = await delegate.count();
    return summary;
  }, { maxWait: 10000, timeout: 120000 });

  console.log('\n========================================');
  console.log('✅ COMPREHENSIVE SEED COMPLETED SUCCESSFULLY');
  console.log('========================================');
  console.log('\n📊 Seeded records:');
  for (const [name, count] of Object.entries(result)) console.log(`   - ${name}: ${count}`);
  console.log('\n🔐 Demo login credentials:');
  console.log('   admin / admin123       (full access)');
  console.log('   ayesha.malik / demo123 (manager)');
  console.log('   bilal.ahmed / demo123  (inventory)');
  console.log('   fatima.khan / demo123  (finance)');
  console.log('   hassan.raza / demo123  (finance)');
  console.log('   sara.iqbal / demo123   (read-only)');
  console.log('\n⚠️  Running this seed again recreates the local development dataset.');
  console.log('========================================\n');
}

main()
  .catch((error) => {
    console.error('Seed error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
