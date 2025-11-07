/**
 * Concurrent Invoice Creation Stress Tests
 * Tests the race condition fix for invoice creation with item reservation
 *
 * This tests the critical bug fix where multiple concurrent invoice creations
 * could attempt to reserve the same items, leading to orphaned invoices.
 *
 * Run with: npm test -- concurrentInvoice.test.js
 */

const db = require('../../config/database');
const InvoiceService = require('../../services/invoiceService');
const { v4: uuidv4 } = require('uuid');

describe('Concurrent Invoice Creation Tests', () => {
  let testCustomer;
  let testItems;
  let testUserId;

  beforeAll(async () => {
    // Create a test user
    testUserId = uuidv4();
    await db.prisma.user.create({
      data: {
        id: testUserId,
        username: `testuser_${Date.now()}`,
        email: `test_${Date.now()}@example.com`,
        password: 'hashedpassword',
        role: 'ADMIN'
      }
    });

    // Create a test customer
    testCustomer = await db.prisma.customer.create({
      data: {
        name: `Test Customer ${Date.now()}`,
        email: `customer_${Date.now()}@example.com`,
        phone: '1234567890',
        currentBalance: 0,
        creditLimit: 1000000, // High limit to not interfere with tests
        createdById: testUserId
      }
    });
  });

  afterAll(async () => {
    // Cleanup: Delete test data
    await db.prisma.invoiceItem.deleteMany({ where: { invoice: { customerId: testCustomer.id } } });
    await db.prisma.invoice.deleteMany({ where: { customerId: testCustomer.id } });
    await db.prisma.item.deleteMany({ where: { createdById: testUserId } });
    await db.prisma.customer.delete({ where: { id: testCustomer.id } });
    await db.prisma.user.delete({ where: { id: testUserId } });
    await db.prisma.$disconnect();
  });

  beforeEach(async () => {
    // Create a fresh category, company, and model for each test
    const category = await db.prisma.category.create({
      data: {
        name: `Test Category ${Date.now()}`,
        createdById: testUserId
      }
    });

    const company = await db.prisma.company.create({
      data: {
        name: `Test Company ${Date.now()}`,
        createdById: testUserId
      }
    });

    const productModel = await db.prisma.productModel.create({
      data: {
        name: `Test Model ${Date.now()}`,
        categoryId: category.id,
        companyId: company.id,
        createdById: testUserId
      }
    });

    // Create 3 test items that are available for sale
    testItems = await Promise.all([
      db.prisma.item.create({
        data: {
          serialNumber: `SN-${Date.now()}-1`,
          categoryId: category.id,
          companyId: company.id,
          modelId: productModel.id,
          purchasePrice: 1000,
          sellingPrice: 1500,
          status: 'In Store',
          inventoryStatus: 'Available',
          specifications: { test: true },
          createdById: testUserId
        }
      }),
      db.prisma.item.create({
        data: {
          serialNumber: `SN-${Date.now()}-2`,
          categoryId: category.id,
          companyId: company.id,
          modelId: productModel.id,
          purchasePrice: 1000,
          sellingPrice: 1500,
          status: 'In Store',
          inventoryStatus: 'Available',
          specifications: { test: true },
          createdById: testUserId
        }
      }),
      db.prisma.item.create({
        data: {
          serialNumber: `SN-${Date.now()}-3`,
          categoryId: category.id,
          companyId: company.id,
          modelId: productModel.id,
          purchasePrice: 1000,
          sellingPrice: 1500,
          status: 'In Store',
          inventoryStatus: 'Available',
          specifications: { test: true },
          createdById: testUserId
        }
      })
    ]);
  });

  afterEach(async () => {
    // Cleanup items and their related data after each test
    if (testItems && testItems.length > 0) {
      const itemIds = testItems.map(item => item.id);
      await db.prisma.inventoryStatusHistory.deleteMany({ where: { itemId: { in: itemIds } } });
      await db.prisma.invoiceItem.deleteMany({ where: { itemId: { in: itemIds } } });
      await db.prisma.item.deleteMany({ where: { id: { in: itemIds } } });
    }
  });

  test('should prevent double-booking: only one concurrent invoice should succeed', async () => {
    // Create invoice data using the same items
    const createInvoiceData = (items) => ({
      customerId: testCustomer.id,
      invoiceDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      subtotal: 4500,
      taxAmount: 360, // 8% tax
      total: 4860,
      items: items.map(item => ({
        itemId: item.id,
        quantity: 1,
        unitPrice: 1500,
        total: 1500
      }))
    });

    const invoiceData1 = createInvoiceData(testItems);
    const invoiceData2 = createInvoiceData(testItems); // Same items!
    const invoiceData3 = createInvoiceData(testItems); // Same items!

    // Attempt to create 3 invoices concurrently using the same items
    const results = await Promise.allSettled([
      InvoiceService.createInvoice(invoiceData1, testUserId),
      InvoiceService.createInvoice(invoiceData2, testUserId),
      InvoiceService.createInvoice(invoiceData3, testUserId)
    ]);

    // Count successes and failures
    const successes = results.filter(r => r.status === 'fulfilled');
    const failures = results.filter(r => r.status === 'rejected');

    // CRITICAL: Only ONE should succeed
    expect(successes.length).toBe(1);
    expect(failures.length).toBe(2);

    // Verify the successful invoice has items reserved
    const successfulInvoice = successes[0].value;
    const reservedItems = await db.prisma.item.findMany({
      where: {
        id: { in: testItems.map(i => i.id) },
        inventoryStatus: 'Reserved',
        reservedForId: successfulInvoice.id
      }
    });

    expect(reservedItems.length).toBe(testItems.length);

    // Verify failures have appropriate error messages
    failures.forEach(failure => {
      expect(failure.reason.message).toMatch(/not available|already reserved/i);
    });

    // CRITICAL: Verify no orphaned invoices exist
    const allInvoices = await db.prisma.invoice.findMany({
      where: {
        customerId: testCustomer.id,
        createdById: testUserId
      },
      include: {
        items: {
          include: {
            item: true
          }
        }
      }
    });

    // Should only have 1 invoice
    expect(allInvoices.length).toBe(1);

    // Verify that invoice has all items properly reserved
    const invoice = allInvoices[0];
    expect(invoice.items.length).toBe(testItems.length);
    invoice.items.forEach(invoiceItem => {
      expect(invoiceItem.item.inventoryStatus).toBe('Reserved');
      expect(invoiceItem.item.reservedForId).toBe(invoice.id);
    });
  });

  test('should handle high concurrency: 10 concurrent requests, only 1 succeeds', async () => {
    const createInvoiceData = () => ({
      customerId: testCustomer.id,
      invoiceDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      subtotal: 4500,
      taxAmount: 360,
      total: 4860,
      items: testItems.map(item => ({
        itemId: item.id,
        quantity: 1,
        unitPrice: 1500,
        total: 1500
      }))
    });

    // Create 10 concurrent invoice creation requests
    const promises = Array.from({ length: 10 }, () =>
      InvoiceService.createInvoice(createInvoiceData(), testUserId)
    );

    const results = await Promise.allSettled(promises);

    const successes = results.filter(r => r.status === 'fulfilled');
    const failures = results.filter(r => r.status === 'rejected');

    // Only ONE should succeed
    expect(successes.length).toBe(1);
    expect(failures.length).toBe(9);

    // Verify only 1 invoice exists in database
    const invoiceCount = await db.prisma.invoice.count({
      where: {
        customerId: testCustomer.id,
        createdById: testUserId
      }
    });

    expect(invoiceCount).toBe(1);

    // Verify all items are reserved for that invoice
    const reservedItems = await db.prisma.item.findMany({
      where: {
        id: { in: testItems.map(i => i.id) },
        inventoryStatus: 'Reserved'
      }
    });

    expect(reservedItems.length).toBe(testItems.length);
    expect(new Set(reservedItems.map(i => i.reservedForId)).size).toBe(1); // All reserved for same invoice
  });

  test('should allow sequential invoice creation for different items', async () => {
    // Create first invoice with first 2 items
    const invoice1Data = {
      customerId: testCustomer.id,
      invoiceDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      subtotal: 3000,
      taxAmount: 240,
      total: 3240,
      items: [
        { itemId: testItems[0].id, quantity: 1, unitPrice: 1500, total: 1500 },
        { itemId: testItems[1].id, quantity: 1, unitPrice: 1500, total: 1500 }
      ]
    };

    const invoice1 = await InvoiceService.createInvoice(invoice1Data, testUserId);
    expect(invoice1).toBeDefined();

    // Create second invoice with third item (different items)
    const invoice2Data = {
      customerId: testCustomer.id,
      invoiceDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      subtotal: 1500,
      taxAmount: 120,
      total: 1620,
      items: [
        { itemId: testItems[2].id, quantity: 1, unitPrice: 1500, total: 1500 }
      ]
    };

    const invoice2 = await InvoiceService.createInvoice(invoice2Data, testUserId);
    expect(invoice2).toBeDefined();

    // Both should succeed since they use different items
    expect(invoice1.id).not.toBe(invoice2.id);

    // Verify all items are reserved
    const reservedItems = await db.prisma.item.findMany({
      where: {
        id: { in: testItems.map(i => i.id) },
        inventoryStatus: 'Reserved'
      }
    });

    expect(reservedItems.length).toBe(3);

    // Verify items 0 and 1 reserved for invoice1
    const invoice1Items = reservedItems.filter(i => i.reservedForId === invoice1.id);
    expect(invoice1Items.length).toBe(2);

    // Verify item 2 reserved for invoice2
    const invoice2Items = reservedItems.filter(i => i.reservedForId === invoice2.id);
    expect(invoice2Items.length).toBe(1);
  });

  test('should reject concurrent requests if items already reserved', async () => {
    // First, create an invoice to reserve the items
    const invoice1Data = {
      customerId: testCustomer.id,
      invoiceDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      subtotal: 4500,
      taxAmount: 360,
      total: 4860,
      items: testItems.map(item => ({
        itemId: item.id,
        quantity: 1,
        unitPrice: 1500,
        total: 1500
      }))
    };

    const invoice1 = await InvoiceService.createInvoice(invoice1Data, testUserId);
    expect(invoice1).toBeDefined();

    // Now try to create another invoice with the same items
    const invoice2Data = {
      customerId: testCustomer.id,
      invoiceDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      subtotal: 4500,
      taxAmount: 360,
      total: 4860,
      items: testItems.map(item => ({
        itemId: item.id,
        quantity: 1,
        unitPrice: 1500,
        total: 1500
      }))
    };

    // Should fail with clear error
    await expect(
      InvoiceService.createInvoice(invoice2Data, testUserId)
    ).rejects.toThrow(/not available/i);

    // Verify only 1 invoice exists
    const invoiceCount = await db.prisma.invoice.count({
      where: { customerId: testCustomer.id }
    });
    expect(invoiceCount).toBe(1);
  });

  test('should maintain transaction atomicity: invoice creation and reservation', async () => {
    const invoiceData = {
      customerId: testCustomer.id,
      invoiceDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      subtotal: 4500,
      taxAmount: 360,
      total: 4860,
      items: testItems.map(item => ({
        itemId: item.id,
        quantity: 1,
        unitPrice: 1500,
        total: 1500
      }))
    };

    const invoice = await InvoiceService.createInvoice(invoiceData, testUserId);

    // Verify invoice created
    expect(invoice).toBeDefined();
    expect(invoice.total).toBe(4860);

    // Verify items reserved in SAME transaction
    const reservedItems = await db.prisma.item.findMany({
      where: {
        id: { in: testItems.map(i => i.id) }
      }
    });

    // ALL items should be reserved for this invoice
    reservedItems.forEach(item => {
      expect(item.inventoryStatus).toBe('Reserved');
      expect(item.reservedForId).toBe(invoice.id);
      expect(item.reservedForType).toBe('Invoice');
      expect(item.reservedBy).toBe(testUserId);
    });

    // Verify status history created
    const historyEntries = await db.prisma.inventoryStatusHistory.findMany({
      where: {
        itemId: { in: testItems.map(i => i.id) },
        referenceId: invoice.id,
        referenceType: 'Invoice'
      }
    });

    expect(historyEntries.length).toBe(testItems.length);
  });
});
