/**
 * Shared mock setup for all service tests
 * This module provides common mocking patterns for:
 * - Transaction wrapper (withTransaction, lockForUpdate)
 * - Invoice status calculation
 * - Payment/Bill number generation
 * - Inventory lifecycle operations
 */

const prismaMock = global.prismaMock;

/**
 * Setup common mocks for transaction operations
 * Call this in beforeEach() of your test suite
 */
function setupTransactionMocks() {
  // Get the mocked transaction utilities
  const { withTransaction, lockForUpdate } = require('../../src/utils/transactionWrapper');

  // Mock withTransaction to execute callback with prismaMock
  withTransaction.mockImplementation(async (callback) => {
    return await callback(prismaMock);
  });

  // Mock lockForUpdate to call $queryRawUnsafe and return first result
  lockForUpdate.mockImplementation(async (tx, table, id) => {
    const sql = `SELECT * FROM "${table}" WHERE id = $1 FOR UPDATE NOWAIT`;
    const results = await tx.$queryRawUnsafe(sql, id);
    return results && results[0] ? results[0] : null;
  });

  return { withTransaction, lockForUpdate };
}

/**
 * Setup mocks for ID generation functions
 */
function setupIdGenerationMocks() {
  const {
    generatePaymentNumber,
    generateInvoiceNumber,
    generateBillNumber,
    generatePONumber
  } = require('../../src/utils/generateId');

  generatePaymentNumber.mockResolvedValue('PAY-202501-0001');
  generateInvoiceNumber.mockResolvedValue('INV-202501-0001');
  generateBillNumber.mockResolvedValue('BILL-202501-0001');
  generatePONumber.mockResolvedValue('PO-202501-0001');

  return {
    generatePaymentNumber,
    generateInvoiceNumber,
    generateBillNumber,
    generatePONumber
  };
}

/**
 * Setup mocks for invoice service
 */
function setupInvoiceServiceMocks() {
  const { calculateInvoiceStatus, updateInvoiceStatus } = require('../../src/services/invoiceService');

  calculateInvoiceStatus.mockReturnValue('Partial');
  if (updateInvoiceStatus && updateInvoiceStatus.mockResolvedValue) {
    updateInvoiceStatus.mockResolvedValue({ status: 'Partial' });
  }

  return { calculateInvoiceStatus, updateInvoiceStatus };
}

/**
 * Setup mocks for bill service
 */
function setupBillServiceMocks() {
  const billService = require('../../src/services/billService');

  if (billService.updateBillStatus && billService.updateBillStatus.mockResolvedValue) {
    billService.updateBillStatus.mockResolvedValue('Partial');
  }

  return billService;
}

/**
 * Setup mocks for inventory lifecycle service
 */
function setupInventoryLifecycleMocks() {
  const inventoryLifecycleService = require('../../src/services/inventoryLifecycleService');

  if (inventoryLifecycleService.markItemsAsSoldForInvoice) {
    inventoryLifecycleService.markItemsAsSoldForInvoice.mockResolvedValue({ saleCount: 0 });
  }

  return inventoryLifecycleService;
}

/**
 * Setup all common mocks at once
 * Call this in beforeEach() for convenience
 */
function setupAllCommonMocks() {
  const mocks = {
    ...setupTransactionMocks(),
    ...setupIdGenerationMocks(),
    ...setupInvoiceServiceMocks(),
    ...setupBillServiceMocks(),
    inventoryLifecycle: setupInventoryLifecycleMocks()
  };

  return mocks;
}

module.exports = {
  setupTransactionMocks,
  setupIdGenerationMocks,
  setupInvoiceServiceMocks,
  setupBillServiceMocks,
  setupInventoryLifecycleMocks,
  setupAllCommonMocks
};
