/**
 * Purchase Order Validation Tests
 * Tests the critical business rule that prevents PO total reduction below billedAmount
 *
 * This tests the fix for the bug where Draft PO totals could be reduced below
 * the cumulative billedAmount, causing data inconsistency (billedAmount > total).
 *
 * Run with: npm test -- purchaseOrderValidation.test.js
 */

const db = require('../../config/database');
const PurchaseOrderService = require('../../services/purchaseOrderService');
const BillService = require('../../services/billService');
const { v4: uuidv4 } = require('uuid');

describe('Purchase Order Total Reduction Validation Tests', () => {
  let testVendor;
  let testUserId;
  let testProductModel;

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

    // Create test vendor
    testVendor = await db.prisma.vendor.create({
      data: {
        name: `Test Vendor ${Date.now()}`,
        email: `vendor_${Date.now()}@example.com`,
        phone: '1234567890',
        currentBalance: 0,
        createdById: testUserId
      }
    });

    // Create test product model
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

    testProductModel = await db.prisma.productModel.create({
      data: {
        name: `Test Model ${Date.now()}`,
        categoryId: category.id,
        companyId: company.id,
        createdById: testUserId
      }
    });
  });

  afterAll(async () => {
    // Cleanup
    await db.prisma.billItem.deleteMany({ where: { bill: { vendorId: testVendor.id } } });
    await db.prisma.bill.deleteMany({ where: { vendorId: testVendor.id } });
    await db.prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrder: { vendorId: testVendor.id } } });
    await db.prisma.purchaseOrder.deleteMany({ where: { vendorId: testVendor.id } });
    await db.prisma.vendor.delete({ where: { id: testVendor.id } });
    await db.prisma.user.delete({ where: { id: testUserId } });
    await db.prisma.$disconnect();
  });

  test('should allow PO total reduction when billedAmount is 0', async () => {
    // Create PO with total 10,000
    const poData = {
      vendorId: testVendor.id,
      orderDate: new Date(),
      expectedDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      subtotal: 10000,
      taxAmount: 800,
      total: 10800,
      lineItems: [
        {
          productModelId: testProductModel.id,
          description: 'Test Item',
          quantity: 10,
          unitPrice: 1000,
          totalPrice: 10000
        }
      ]
    };

    const po = await PurchaseOrderService.createPurchaseOrder(poData, testUserId);
    expect(po.total).toBe(10800);
    expect(po.billedAmount).toBe(0);

    // Reduce total to 5,000 (should succeed since billedAmount = 0)
    const updatedData = {
      subtotal: 5000,
      taxAmount: 400,
      total: 5400
    };

    const updatedPO = await PurchaseOrderService.updatePurchaseOrder(po.id, updatedData);
    expect(updatedPO.total).toBe(5400);
  });

  test('should prevent PO total reduction below billedAmount', async () => {
    // Create PO with total 10,000
    const poData = {
      vendorId: testVendor.id,
      orderDate: new Date(),
      expectedDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      subtotal: 10000,
      taxAmount: 800,
      total: 10800,
      lineItems: [
        {
          productModelId: testProductModel.id,
          description: 'Test Item',
          quantity: 10,
          unitPrice: 1000,
          totalPrice: 10000
        }
      ]
    };

    const po = await PurchaseOrderService.createPurchaseOrder(poData, testUserId);

    // Update PO status to "Sent" so we can create bills
    await PurchaseOrderService.updatePurchaseOrderStatus(po.id, 'Sent', testUserId);

    // Create a bill for 8,000 PKR (billedAmount becomes 8,000)
    const billData = {
      purchaseOrderId: po.id,
      vendorId: testVendor.id,
      billDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      subtotal: 8000,
      taxAmount: 640,
      total: 8640,
      lineItems: [
        {
          description: 'Partial delivery',
          quantity: 8,
          unitPrice: 1000,
          total: 8000
        }
      ]
    };

    await BillService.createBill(billData, testUserId);

    // Verify billedAmount is now 8,640
    const poAfterBill = await PurchaseOrderService.getPurchaseOrder(po.id);
    expect(poAfterBill.billedAmount).toBe(8640);

    // Now try to reduce PO total to 5,000 (should FAIL)
    const updatedData = {
      subtotal: 5000,
      taxAmount: 400,
      total: 5400
    };

    await expect(
      PurchaseOrderService.updatePurchaseOrder(po.id, updatedData)
    ).rejects.toThrow(/Cannot reduce PO total/i);

    await expect(
      PurchaseOrderService.updatePurchaseOrder(po.id, updatedData)
    ).rejects.toThrow(/Bills totaling 8640/i);
  });

  test('should allow PO total increase even when bills exist', async () => {
    // Create PO with total 10,000
    const poData = {
      vendorId: testVendor.id,
      orderDate: new Date(),
      expectedDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      subtotal: 10000,
      taxAmount: 800,
      total: 10800,
      lineItems: [
        {
          productModelId: testProductModel.id,
          description: 'Test Item',
          quantity: 10,
          unitPrice: 1000,
          totalPrice: 10000
        }
      ]
    };

    const po = await PurchaseOrderService.createPurchaseOrder(poData, testUserId);

    // Update status to Sent
    await PurchaseOrderService.updatePurchaseOrderStatus(po.id, 'Sent', testUserId);

    // Create a bill for 8,000 PKR
    const billData = {
      purchaseOrderId: po.id,
      vendorId: testVendor.id,
      billDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      subtotal: 8000,
      taxAmount: 640,
      total: 8640,
      lineItems: [
        {
          description: 'Partial delivery',
          quantity: 8,
          unitPrice: 1000,
          total: 8000
        }
      ]
    };

    await BillService.createBill(billData, testUserId);

    // Verify billedAmount is 8,640
    const poAfterBill = await PurchaseOrderService.getPurchaseOrder(po.id);
    expect(poAfterBill.billedAmount).toBe(8640);

    // Increase PO total to 15,000 (should succeed)
    const updatedData = {
      subtotal: 15000,
      taxAmount: 1200,
      total: 16200
    };

    const updatedPO = await PurchaseOrderService.updatePurchaseOrder(po.id, updatedData);
    expect(updatedPO.total).toBe(16200);
  });

  test('should allow PO total equal to billedAmount', async () => {
    // Create PO with total 10,000
    const poData = {
      vendorId: testVendor.id,
      orderDate: new Date(),
      expectedDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      subtotal: 10000,
      taxAmount: 800,
      total: 10800,
      lineItems: [
        {
          productModelId: testProductModel.id,
          description: 'Test Item',
          quantity: 10,
          unitPrice: 1000,
          totalPrice: 10000
        }
      ]
    };

    const po = await PurchaseOrderService.createPurchaseOrder(poData, testUserId);

    // Update status to Sent
    await PurchaseOrderService.updatePurchaseOrderStatus(po.id, 'Sent', testUserId);

    // Create a bill for 8,000 PKR
    const billData = {
      purchaseOrderId: po.id,
      vendorId: testVendor.id,
      billDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      subtotal: 8000,
      taxAmount: 640,
      total: 8640,
      lineItems: [
        {
          description: 'Partial delivery',
          quantity: 8,
          unitPrice: 1000,
          total: 8000
        }
      ]
    };

    await BillService.createBill(billData, testUserId);

    // Set PO total exactly equal to billedAmount (should succeed)
    const updatedData = {
      subtotal: 8000,
      taxAmount: 640,
      total: 8640
    };

    const updatedPO = await PurchaseOrderService.updatePurchaseOrder(po.id, updatedData);
    expect(updatedPO.total).toBe(8640);
  });

  test('should only allow updates to Draft POs', async () => {
    // Create PO
    const poData = {
      vendorId: testVendor.id,
      orderDate: new Date(),
      expectedDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      subtotal: 10000,
      taxAmount: 800,
      total: 10800,
      lineItems: [
        {
          productModelId: testProductModel.id,
          description: 'Test Item',
          quantity: 10,
          unitPrice: 1000,
          totalPrice: 10000
        }
      ]
    };

    const po = await PurchaseOrderService.createPurchaseOrder(poData, testUserId);

    // Update status to "Sent"
    await PurchaseOrderService.updatePurchaseOrderStatus(po.id, 'Sent', testUserId);

    // Try to update the PO (should fail - not in Draft status)
    const updatedData = {
      subtotal: 12000,
      taxAmount: 960,
      total: 12960
    };

    await expect(
      PurchaseOrderService.updatePurchaseOrder(po.id, updatedData)
    ).rejects.toThrow(/Only Draft POs can be edited/i);
  });

  test('should prevent data inconsistency: billedAmount never exceeds total', async () => {
    // Create PO with total 10,000
    const poData = {
      vendorId: testVendor.id,
      orderDate: new Date(),
      expectedDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      subtotal: 10000,
      taxAmount: 800,
      total: 10800,
      lineItems: [
        {
          productModelId: testProductModel.id,
          description: 'Test Item',
          quantity: 10,
          unitPrice: 1000,
          totalPrice: 10000
        }
      ]
    };

    const po = await PurchaseOrderService.createPurchaseOrder(poData, testUserId);

    // Update status to Sent
    await PurchaseOrderService.updatePurchaseOrderStatus(po.id, 'Sent', testUserId);

    // Create bill #1 for 5,000 PKR
    const bill1Data = {
      purchaseOrderId: po.id,
      vendorId: testVendor.id,
      billDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      subtotal: 5000,
      taxAmount: 400,
      total: 5400,
      lineItems: [
        {
          description: 'First delivery',
          quantity: 5,
          unitPrice: 1000,
          total: 5000
        }
      ]
    };

    await BillService.createBill(bill1Data, testUserId);

    // Create bill #2 for 3,000 PKR
    const bill2Data = {
      purchaseOrderId: po.id,
      vendorId: testVendor.id,
      billDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      subtotal: 3000,
      taxAmount: 240,
      total: 3240,
      lineItems: [
        {
          description: 'Second delivery',
          quantity: 3,
          unitPrice: 1000,
          total: 3000
        }
      ]
    };

    await BillService.createBill(bill2Data, testUserId);

    // Total billedAmount should be 5,400 + 3,240 = 8,640
    const poAfterBills = await PurchaseOrderService.getPurchaseOrder(po.id);
    expect(poAfterBills.billedAmount).toBe(8640);

    // Try to reduce total to 7,000 (should FAIL - below billedAmount)
    const updatedData = {
      subtotal: 7000,
      taxAmount: 560,
      total: 7560
    };

    await expect(
      PurchaseOrderService.updatePurchaseOrder(po.id, updatedData)
    ).rejects.toThrow(/Cannot reduce PO total/i);

    // Verify data integrity maintained: billedAmount <= total
    const finalPO = await PurchaseOrderService.getPurchaseOrder(po.id);
    expect(finalPO.billedAmount).toBeLessThanOrEqual(finalPO.total);
  });
});
