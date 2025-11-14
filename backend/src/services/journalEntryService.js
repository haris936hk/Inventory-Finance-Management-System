/**
 * Journal Entry Service
 *
 * Handles automated double-entry bookkeeping for the simplified accounting system.
 * Creates journal entries and updates account balances for:
 * - Invoice creation (DR: A/R, CR: Sales Revenue, CR: Sales Tax Payable)
 * - Invoice payment (COGS recognition: DR: COGS, CR: Inventory)
 * - Bill creation (DR: Inventory, DR: Input Tax, CR: A/P)
 * - Cancellations and reversals
 *
 * IMPORTANT: This service should ONLY be called within an existing transaction (tx)
 */

const logger = require('../config/logger');
const { formatAmount, Decimal, compareAmounts } = require('../utils/transactionWrapper');

class JournalEntryService {
  /**
   * Account codes for the simplified chart of accounts
   */
  static ACCOUNTS = {
    CASH: '1100',
    ACCOUNTS_RECEIVABLE: '1200',
    INVENTORY: '1300',
    INPUT_TAX_RECEIVABLE: '1210',
    ACCOUNTS_PAYABLE: '2000',
    SALES_TAX_PAYABLE: '2100',
    SALES_REVENUE: '4000',
    COGS: '5000'
  };

  /**
   * FIXED: Batch lookup account IDs by codes to prevent N+1 queries
   * @param {Object} tx - Prisma transaction client
   * @param {string[]} accountCodes - Array of account codes
   * @returns {Promise<Map<string, string>>} Map of accountCode -> accountId
   */
  static async getAccountIdsByCodes(tx, accountCodes) {
    const uniqueCodes = [...new Set(accountCodes)]; // Remove duplicates

    const accounts = await tx.account.findMany({
      where: { code: { in: uniqueCodes } },
      select: { id: true, code: true }
    });

    // Validate all codes were found
    if (accounts.length !== uniqueCodes.length) {
      const foundCodes = accounts.map(a => a.code);
      const missingCodes = uniqueCodes.filter(code => !foundCodes.includes(code));
      throw new Error(
        `Accounts not found for codes: ${missingCodes.join(', ')}. ` +
        `Please run account seeding migration.`
      );
    }

    // Return as Map for O(1) lookup
    return new Map(accounts.map(a => [a.code, a.id]));
  }

  /**
   * Get account ID by code (direct lookup, no caching to avoid staleness)
   * Account lookups are fast due to unique index on code column
   * @param {Object} tx - Prisma transaction client
   * @param {string} accountCode - Account code
   * @returns {Promise<string>} Account ID
   */
  static async getAccountIdByCode(tx, accountCode) {
    const account = await tx.account.findUnique({
      where: { code: accountCode },
      select: { id: true }
    });

    if (!account) {
      throw new Error(`Account with code ${accountCode} not found. Please run account seeding migration.`);
    }

    return account.id;
  }

  /**
   * Get full account object by code (used for opening balance entries)
   * @param {Object} tx - Prisma transaction client
   * @param {string} accountCode - Account code
   * @returns {Promise<Object>} Account object
   */
  static async getAccountByCode(tx, accountCode) {
    const account = await tx.account.findUnique({
      where: { code: accountCode },
      select: { id: true, code: true, name: true, type: true }
    });

    if (!account) {
      throw new Error(`Account with code ${accountCode} not found. Please run account seeding migration.`);
    }

    return account;
  }

  /**
   * Create journal entries (must be called within a transaction)
   * @param {Object} tx - Prisma transaction client
   * @param {Array} entries - Array of entry objects
   * @param {Object} metadata - Source information
   * @returns {Promise<Array>} Created journal entries
   */
  static async createJournalEntries(tx, entries, metadata = {}) {
    const { sourceType, sourceId, reference, entryDate } = metadata;

    // FIXED: Validate entries balance (DR = CR) with Decimal precision
    const totalDebit = entries.reduce((sum, e) =>
      sum.plus(new Decimal(e.debit || 0)), new Decimal(0)
    ).toNumber();
    const totalCredit = entries.reduce((sum, e) =>
      sum.plus(new Decimal(e.credit || 0)), new Decimal(0)
    ).toNumber();

    // FIXED: Use precise comparison instead of Math.abs with tolerance
    if (!compareAmounts(totalDebit, totalCredit)) {
      const difference = formatAmount(totalDebit - totalCredit);
      logger.error('Journal entries do not balance', {
        totalDebit: formatAmount(totalDebit),
        totalCredit: formatAmount(totalCredit),
        difference,
        entries
      });
      throw new Error(
        `Journal entries must balance. DR: ${formatAmount(totalDebit)}, ` +
        `CR: ${formatAmount(totalCredit)}, Difference: ${difference}`
      );
    }

    // FIXED: Batch lookup account IDs to prevent N+1 queries
    const accountCodes = entries.map(e => e.accountCode);
    const accountMap = await this.getAccountIdsByCodes(tx, accountCodes);

    // Create all journal entries
    const createdEntries = [];
    for (const entry of entries) {
      const accountId = accountMap.get(entry.accountCode);

      const journalEntry = await tx.journalEntry.create({
        data: {
          accountId,
          entryDate: entryDate || new Date(),
          reference: reference || '',
          description: entry.description,
          debit: formatAmount(entry.debit || 0),
          credit: formatAmount(entry.credit || 0),
          sourceType: sourceType || null,
          sourceId: sourceId || null
        }
      });

      createdEntries.push(journalEntry);

      // Update account balance
      await this.updateAccountBalance(tx, accountId, entry.debit || 0, entry.credit || 0);
    }

    logger.info('Journal entries created', {
      sourceType,
      sourceId,
      reference,
      entriesCount: createdEntries.length,
      totalDebit,
      totalCredit
    });

    return createdEntries;
  }

  /**
   * Update account balance based on debit/credit
   * @param {Object} tx - Prisma transaction client
   * @param {string} accountId - Account ID
   * @param {number} debit - Debit amount
   * @param {number} credit - Credit amount
   */
  static async updateAccountBalance(tx, accountId, debit, credit) {
    const account = await tx.account.findUnique({
      where: { id: accountId },
      select: { currentBalance: true, type: true }
    });

    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }

    // FIXED: Calculate new balance based on account type with Decimal precision
    // Assets and Expenses: increase with Debit, decrease with Credit
    // Liabilities, Income, Equity: increase with Credit, decrease with Debit
    let balanceChange;
    if (['Asset', 'Expense'].includes(account.type)) {
      balanceChange = new Decimal(debit || 0).minus(new Decimal(credit || 0));
    } else {
      balanceChange = new Decimal(credit || 0).minus(new Decimal(debit || 0));
    }

    const newBalance = formatAmount(
      new Decimal(account.currentBalance || 0).plus(balanceChange).toNumber()
    );

    await tx.account.update({
      where: { id: accountId },
      data: { currentBalance: formatAmount(newBalance) }
    });
  }

  /**
   * Create journal entries for invoice creation
   * @param {Object} tx - Prisma transaction client
   * @param {Object} invoice - Invoice data
   * @returns {Promise<Array>} Created journal entries
   */
  static async createInvoiceEntries(tx, invoice) {
    const entries = [
      {
        accountCode: this.ACCOUNTS.ACCOUNTS_RECEIVABLE,
        description: `Invoice ${invoice.invoiceNumber} - ${invoice.customer?.name || 'Customer'}`,
        debit: invoice.total,
        credit: 0
      },
      {
        accountCode: this.ACCOUNTS.SALES_REVENUE,
        description: `Sales Revenue - Invoice ${invoice.invoiceNumber}`,
        debit: 0,
        credit: invoice.subtotal
      }
    ];

    // Add sales tax entry if applicable
    if (invoice.taxAmount && parseFloat(invoice.taxAmount) > 0) {
      entries.push({
        accountCode: this.ACCOUNTS.SALES_TAX_PAYABLE,
        description: `Sales Tax - Invoice ${invoice.invoiceNumber}`,
        debit: 0,
        credit: invoice.taxAmount
      });
    }

    return await this.createJournalEntries(tx, entries, {
      sourceType: 'Invoice',
      sourceId: invoice.id,
      reference: invoice.invoiceNumber,
      entryDate: invoice.invoiceDate
    });
  }

  /**
   * Reverse journal entries for invoice cancellation
   * @param {Object} tx - Prisma transaction client
   * @param {Object} invoice - Invoice data
   * @param {string} reason - Cancellation reason
   * @returns {Promise<Array>} Created reversal entries
   */
  static async reverseInvoiceEntries(tx, invoice, reason) {
    const entries = [
      {
        accountCode: this.ACCOUNTS.ACCOUNTS_RECEIVABLE,
        description: `Invoice ${invoice.invoiceNumber} CANCELLED - ${reason}`,
        debit: 0,
        credit: invoice.total
      },
      {
        accountCode: this.ACCOUNTS.SALES_REVENUE,
        description: `Sales Revenue Reversal - Invoice ${invoice.invoiceNumber} CANCELLED`,
        debit: invoice.subtotal,
        credit: 0
      }
    ];

    // Reverse sales tax entry if applicable
    if (invoice.taxAmount && parseFloat(invoice.taxAmount) > 0) {
      entries.push({
        accountCode: this.ACCOUNTS.SALES_TAX_PAYABLE,
        description: `Sales Tax Reversal - Invoice ${invoice.invoiceNumber} CANCELLED`,
        debit: invoice.taxAmount,
        credit: 0
      });
    }

    return await this.createJournalEntries(tx, entries, {
      sourceType: 'Invoice',
      sourceId: invoice.id,
      reference: `${invoice.invoiceNumber}-CANCEL`,
      entryDate: new Date()
    });
  }

  /**
   * Create COGS entries when invoice is fully paid
   * @param {Object} tx - Prisma transaction client
   * @param {Object} invoice - Invoice data with items
   * @param {number} totalCOGS - Total cost of goods sold
   * @returns {Promise<Array>} Created journal entries
   */
  static async createCOGSEntries(tx, invoice, totalCOGS) {
    if (!totalCOGS || totalCOGS <= 0) {
      logger.warn('COGS is zero or negative, skipping COGS entries', {
        invoiceId: invoice.id,
        totalCOGS
      });
      return [];
    }

    const entries = [
      {
        accountCode: this.ACCOUNTS.COGS,
        description: `Cost of Goods Sold - Invoice ${invoice.invoiceNumber}`,
        debit: totalCOGS,
        credit: 0
      },
      {
        accountCode: this.ACCOUNTS.INVENTORY,
        description: `Inventory Reduction - Invoice ${invoice.invoiceNumber}`,
        debit: 0,
        credit: totalCOGS
      }
    ];

    return await this.createJournalEntries(tx, entries, {
      sourceType: 'Invoice',
      sourceId: invoice.id,
      reference: `${invoice.invoiceNumber}-COGS`,
      entryDate: new Date()
    });
  }

  /**
   * Create journal entries for customer payment
   * @param {Object} tx - Prisma transaction client
   * @param {Object} payment - Payment data
   * @returns {Promise<Array>} Created journal entries
   */
  static async createCustomerPaymentEntries(tx, payment) {
    const entries = [
      {
        accountCode: this.ACCOUNTS.CASH,
        description: `Payment Received ${payment.paymentNumber} - ${payment.customer?.name || 'Customer'} - ${payment.method}`,
        debit: payment.amount,
        credit: 0
      },
      {
        accountCode: this.ACCOUNTS.ACCOUNTS_RECEIVABLE,
        description: `Payment Applied - Invoice ${payment.invoice?.invoiceNumber || payment.invoiceId}`,
        debit: 0,
        credit: payment.amount
      }
    ];

    return await this.createJournalEntries(tx, entries, {
      sourceType: 'Payment',
      sourceId: payment.id,
      reference: payment.paymentNumber,
      entryDate: payment.paymentDate
    });
  }

  /**
   * Reverse journal entries for customer payment void
   * @param {Object} tx - Prisma transaction client
   * @param {Object} payment - Payment data
   * @param {string} reason - Void reason
   * @returns {Promise<Array>} Created reversal entries
   */
  static async reverseCustomerPaymentEntries(tx, payment, reason) {
    const entries = [
      {
        accountCode: this.ACCOUNTS.CASH,
        description: `Payment ${payment.paymentNumber} VOIDED - ${reason}`,
        debit: 0,
        credit: payment.amount
      },
      {
        accountCode: this.ACCOUNTS.ACCOUNTS_RECEIVABLE,
        description: `Payment Reversal - Invoice ${payment.invoice?.invoiceNumber || payment.invoiceId} VOIDED`,
        debit: payment.amount,
        credit: 0
      }
    ];

    return await this.createJournalEntries(tx, entries, {
      sourceType: 'Payment',
      sourceId: payment.id,
      reference: `${payment.paymentNumber}-VOID`,
      entryDate: new Date()
    });
  }

  /**
   * Create journal entries for vendor payment
   * @param {Object} tx - Prisma transaction client
   * @param {Object} payment - Vendor payment data
   * @returns {Promise<Array>} Created journal entries
   */
  static async createVendorPaymentEntries(tx, payment) {
    const entries = [
      {
        accountCode: this.ACCOUNTS.ACCOUNTS_PAYABLE,
        description: `Payment to Vendor ${payment.vendor?.name || 'Vendor'} - ${payment.paymentNumber}`,
        debit: payment.amount,
        credit: 0
      },
      {
        accountCode: this.ACCOUNTS.CASH,
        description: `Payment Issued ${payment.paymentNumber} - ${payment.method}`,
        debit: 0,
        credit: payment.amount
      }
    ];

    return await this.createJournalEntries(tx, entries, {
      sourceType: 'VendorPayment',
      sourceId: payment.id,
      reference: payment.paymentNumber,
      entryDate: payment.paymentDate
    });
  }

  /**
   * Reverse journal entries for vendor payment void
   * @param {Object} tx - Prisma transaction client
   * @param {Object} payment - Vendor payment data
   * @param {string} reason - Void reason
   * @returns {Promise<Array>} Created reversal entries
   */
  static async reverseVendorPaymentEntries(tx, payment, reason) {
    const entries = [
      {
        accountCode: this.ACCOUNTS.ACCOUNTS_PAYABLE,
        description: `Vendor Payment ${payment.paymentNumber} VOIDED - ${reason}`,
        debit: 0,
        credit: payment.amount
      },
      {
        accountCode: this.ACCOUNTS.CASH,
        description: `Payment Reversal ${payment.paymentNumber} VOIDED`,
        debit: payment.amount,
        credit: 0
      }
    ];

    return await this.createJournalEntries(tx, entries, {
      sourceType: 'VendorPayment',
      sourceId: payment.id,
      reference: `${payment.paymentNumber}-VOID`,
      entryDate: new Date()
    });
  }

  /**
   * Create journal entries for bill creation (vendor purchase)
   * @param {Object} tx - Prisma transaction client
   * @param {Object} bill - Bill data
   * @returns {Promise<Array>} Created journal entries
   */
  static async createBillEntries(tx, bill) {
    const entries = [
      {
        accountCode: this.ACCOUNTS.INVENTORY,
        description: `Inventory Purchase - Bill ${bill.billNumber}`,
        debit: bill.subtotal,
        credit: 0
      },
      {
        accountCode: this.ACCOUNTS.ACCOUNTS_PAYABLE,
        description: `Bill ${bill.billNumber} - ${bill.vendor?.name || 'Vendor'}`,
        debit: 0,
        credit: bill.total
      }
    ];

    // Add input tax entry if applicable (GST paid to vendor)
    if (bill.taxAmount && parseFloat(bill.taxAmount) > 0) {
      entries.push({
        accountCode: this.ACCOUNTS.INPUT_TAX_RECEIVABLE,
        description: `Input Tax - Bill ${bill.billNumber}`,
        debit: bill.taxAmount,
        credit: 0
      });
    }

    return await this.createJournalEntries(tx, entries, {
      sourceType: 'Bill',
      sourceId: bill.id,
      reference: bill.billNumber,
      entryDate: bill.billDate
    });
  }

  /**
   * Reverse journal entries for bill cancellation
   * @param {Object} tx - Prisma transaction client
   * @param {Object} bill - Bill data
   * @param {string} reason - Cancellation reason
   * @returns {Promise<Array>} Created reversal entries
   */
  static async reverseBillEntries(tx, bill, reason) {
    const entries = [
      {
        accountCode: this.ACCOUNTS.INVENTORY,
        description: `Inventory Purchase Reversal - Bill ${bill.billNumber} CANCELLED`,
        debit: 0,
        credit: bill.subtotal
      },
      {
        accountCode: this.ACCOUNTS.ACCOUNTS_PAYABLE,
        description: `Bill ${bill.billNumber} CANCELLED - ${reason}`,
        debit: bill.total,
        credit: 0
      }
    ];

    // Reverse input tax entry if applicable
    if (bill.taxAmount && parseFloat(bill.taxAmount) > 0) {
      entries.push({
        accountCode: this.ACCOUNTS.INPUT_TAX_RECEIVABLE,
        description: `Input Tax Reversal - Bill ${bill.billNumber} CANCELLED`,
        debit: 0,
        credit: bill.taxAmount
      });
    }

    return await this.createJournalEntries(tx, entries, {
      sourceType: 'Bill',
      sourceId: bill.id,
      reference: `${bill.billNumber}-CANCEL`,
      entryDate: new Date()
    });
  }

  /**
   * Reverse COGS journal entries (for voided payments with proportional COGS)
   * @param {Object} tx - Prisma transaction client
   * @param {Object} reference - Invoice/payment reference data
   * @param {Decimal} cogsAmount - Amount of COGS to reverse
   * @returns {Promise<Array>} Created reversal entries
   */
  static async reverseCOGSEntries(tx, reference, cogsAmount) {
    const entries = [
      {
        accountCode: this.ACCOUNTS.COGS,
        description: `COGS Reversal - Payment ${reference.paymentNumber} voided (Invoice ${reference.invoiceNumber})`,
        debit: 0,
        credit: cogsAmount
      },
      {
        accountCode: this.ACCOUNTS.INVENTORY,
        description: `Inventory Restoration - Payment ${reference.paymentNumber} voided (Invoice ${reference.invoiceNumber})`,
        debit: cogsAmount,
        credit: 0
      }
    ];

    return await this.createJournalEntries(tx, entries, {
      sourceType: 'Invoice',
      sourceId: reference.id,
      reference: `${reference.invoiceNumber}-COGS-REVERSAL-${reference.paymentNumber}`,
      entryDate: new Date()
    });
  }

  /**
   * Get all journal entries for a specific source
   * @param {Object} tx - Prisma transaction client
   * @param {string} sourceType - Source type ('Invoice', 'Bill', etc.)
   * @param {string} sourceId - Source ID
   * @returns {Promise<Array>} Journal entries
   */
  static async getEntriesBySource(tx, sourceType, sourceId) {
    return await tx.journalEntry.findMany({
      where: {
        sourceType,
        sourceId,
        deletedAt: null
      },
      include: {
        account: {
          select: {
            code: true,
            name: true,
            type: true
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });
  }

  /**
   * Create journal entries for customer opening balance
   * DR: Accounts Receivable, CR: Opening Balance Equity
   *
   * @param {Object} tx - Prisma transaction client
   * @param {Object} data - Opening balance data
   * @param {string} data.customerId - Customer ID
   * @param {string} data.customerName - Customer name
   * @param {number} data.amount - Opening balance amount
   * @param {Date} data.entryDate - Entry date
   * @returns {Promise<void>}
   */
  static async createCustomerOpeningBalanceEntries(tx, data) {
    const { customerId, customerName, amount, entryDate } = data;

    if (amount === 0) return; // No entry needed for zero balance

    // FIXED: Batch lookup accounts to prevent sequential queries
    const accountMap = await this.getAccountIdsByCodes(tx, ['1200', '3900']);
    const accountsReceivableId = accountMap.get('1200'); // A/R
    const openingBalanceEquityId = accountMap.get('3900'); // Opening Balance Equity

    const absAmount = Math.abs(amount);
    const isDebit = amount > 0; // Positive = customer owes us

    const entries = [
      {
        accountCode: '1200',
        entryDate,
        reference: customerId,
        description: `Opening balance for customer: ${customerName}`,
        debit: isDebit ? absAmount : 0,
        credit: isDebit ? 0 : absAmount,
        sourceType: 'Customer',
        sourceId: customerId
      },
      {
        accountCode: '3900',
        entryDate,
        reference: customerId,
        description: `Opening balance for customer: ${customerName}`,
        debit: isDebit ? 0 : absAmount,
        credit: isDebit ? absAmount : 0,
        sourceType: 'Customer',
        sourceId: customerId
      }
    ];

    await this.createJournalEntries(tx, entries);
    logger.info(`Created opening balance journal entries for customer: ${customerName}`, {
      customerId,
      amount
    });
  }

  /**
   * Create journal entries for vendor opening balance
   * DR: Opening Balance Equity, CR: Accounts Payable (if we owe vendor)
   * DR: Accounts Payable, CR: Opening Balance Equity (if vendor owes us - rare)
   *
   * @param {Object} tx - Prisma transaction client
   * @param {Object} data - Opening balance data
   * @param {string} data.vendorId - Vendor ID
   * @param {string} data.vendorName - Vendor name
   * @param {number} data.amount - Opening balance amount
   * @param {Date} data.entryDate - Entry date
   * @returns {Promise<void>}
   */
  static async createVendorOpeningBalanceEntries(tx, data) {
    const { vendorId, vendorName, amount, entryDate } = data;

    if (amount === 0) return; // No entry needed for zero balance

    // FIXED: Batch lookup accounts to prevent sequential queries (now handled by createJournalEntries)
    const absAmount = Math.abs(amount);
    const isCredit = amount > 0; // Positive = we owe vendor

    const entries = [
      {
        accountCode: '2000',
        entryDate,
        reference: vendorId,
        description: `Opening balance for vendor: ${vendorName}`,
        debit: isCredit ? 0 : absAmount,
        credit: isCredit ? absAmount : 0,
        sourceType: 'Vendor',
        sourceId: vendorId
      },
      {
        accountCode: '3900',
        entryDate,
        reference: vendorId,
        description: `Opening balance for vendor: ${vendorName}`,
        debit: isCredit ? absAmount : 0,
        credit: isCredit ? 0 : absAmount,
        sourceType: 'Vendor',
        sourceId: vendorId
      }
    ];

    await this.createJournalEntries(tx, entries);
    logger.info(`Created opening balance journal entries for vendor: ${vendorName}`, {
      vendorId,
      amount
    });
  }

  /**
   * Clear account cache (useful for testing)
   */
  static clearCache() {
    this._accountCache = {};
  }
}

module.exports = JournalEntryService;
