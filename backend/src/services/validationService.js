/**
 * Validation Service
 * Centralizes all business rule validations for the finance workflow
 *
 * Provides consistent validation logic across:
 * - Invoices, Bills, Purchase Orders
 * - Payments and financial transactions
 * - Dates, amounts, and calculations
 * - Ledger balance reconciliation
 */

const logger = require('../config/logger');
const { formatAmount, compareAmounts, Decimal } = require('../utils/transactionWrapper');
const db = require('../config/database');

class ValidationService {
  /**
   * Date Validations
   */

  /**
   * Validate invoice/bill date is not in the future
   */
  static validateDocumentDate(date, documentType = 'Document') {
    const docDate = new Date(date);
    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of today

    if (docDate > today) {
      throw new Error(`${documentType} date cannot be in the future. Date: ${docDate.toISOString().split('T')[0]}`);
    }

    return true;
  }

  /**
   * Validate due date is after document date
   */
  static validateDueDate(documentDate, dueDate, documentType = 'Document') {
    const docDate = new Date(documentDate);
    const dueDateObj = new Date(dueDate);

    if (dueDateObj <= docDate) {
      throw new Error(
        `${documentType} due date must be after document date. ` +
        `Document: ${docDate.toISOString().split('T')[0]}, Due: ${dueDateObj.toISOString().split('T')[0]}`
      );
    }

    return true;
  }

  /**
   * Validate payment date is not before document date
   */
  static validatePaymentDate(paymentDate, documentDate, documentType = 'Document') {
    const payDate = new Date(paymentDate);
    const docDate = new Date(documentDate);

    if (payDate < docDate) {
      throw new Error(
        `Payment date cannot be before ${documentType.toLowerCase()} date. ` +
        `Payment: ${payDate.toISOString().split('T')[0]}, Document: ${docDate.toISOString().split('T')[0]}`
      );
    }

    return true;
  }

  /**
   * Validate expected delivery date is after order date
   */
  static validateExpectedDeliveryDate(orderDate, expectedDeliveryDate) {
    const ordDate = new Date(orderDate);
    const expDate = new Date(expectedDeliveryDate);

    if (expDate <= ordDate) {
      throw new Error(
        `Expected delivery date must be after order date. ` +
        `Order: ${ordDate.toISOString().split('T')[0]}, Expected: ${expDate.toISOString().split('T')[0]}`
      );
    }

    return true;
  }

  /**
   * Amount Validations
   */

  /**
   * Validate amount is positive
   */
  static validatePositiveAmount(amount, fieldName = 'Amount') {
    const amt = parseFloat(amount);

    if (isNaN(amt) || amt <= 0) {
      throw new Error(`${fieldName} must be a positive number. Got: ${amount}`);
    }

    return true;
  }

  /**
   * Validate amount is non-negative
   */
  static validateNonNegativeAmount(amount, fieldName = 'Amount') {
    const amt = parseFloat(amount);

    if (isNaN(amt) || amt < 0) {
      throw new Error(`${fieldName} cannot be negative. Got: ${amount}`);
    }

    return true;
  }

  /**
   * Validate total = subtotal + tax - discount
   */
  static validateTotalCalculation(subtotal, taxAmount, discount, total, documentType = 'Document') {
    const sub = formatAmount(subtotal);
    const tax = formatAmount(taxAmount || 0);
    const disc = formatAmount(discount || 0);
    const tot = formatAmount(total);

    const expectedTotal = formatAmount(sub + tax - disc);

    if (!compareAmounts(tot, expectedTotal)) {
      throw new Error(
        `${documentType} total calculation mismatch. ` +
        `Expected: ${expectedTotal} (${sub} + ${tax} - ${disc}), Got: ${tot}`
      );
    }

    return true;
  }

  /**
   * Validate line items sum equals subtotal
   */
  static validateLineItemsTotal(lineItems, subtotal, documentType = 'Document') {
    const lineItemsTotal = lineItems.reduce((sum, item) => {
      return sum + parseFloat(item.lineTotal || item.totalPrice || 0);
    }, 0);

    const formattedLineTotal = formatAmount(lineItemsTotal);
    const formattedSubtotal = formatAmount(subtotal);

    if (!compareAmounts(formattedLineTotal, formattedSubtotal)) {
      throw new Error(
        `${documentType} line items total (${formattedLineTotal}) does not match subtotal (${formattedSubtotal})`
      );
    }

    return true;
  }

  /**
   * Validate discount percentage limits
   */
  static validateDiscountPercentage(discountPercentage, maxPercentage = 50) {
    const disc = parseFloat(discountPercentage);

    if (isNaN(disc) || disc < 0 || disc > maxPercentage) {
      throw new Error(
        `Discount percentage must be between 0 and ${maxPercentage}%. Got: ${discountPercentage}%`
      );
    }

    return true;
  }

  /**
   * Validate maximum invoice/bill amount
   */
  static validateMaximumAmount(amount, maxAmount, documentType = 'Document') {
    const amt = parseFloat(amount);
    const max = parseFloat(maxAmount);

    if (amt > max) {
      throw new Error(
        `${documentType} amount (${amt}) exceeds maximum allowed amount (${max})`
      );
    }

    return true;
  }

  /**
   * Tax Validations
   */

  /**
   * Validate tax rate is within acceptable range
   */
  static validateTaxRate(taxRate, minRate = 0, maxRate = 30) {
    const rate = parseFloat(taxRate);

    if (isNaN(rate) || rate < minRate || rate > maxRate) {
      throw new Error(
        `Tax rate must be between ${minRate}% and ${maxRate}%. Got: ${taxRate}%`
      );
    }

    return true;
  }

  /**
   * Validate tax amount matches calculated tax
   */
  static validateTaxAmount(subtotal, taxRate, taxAmount, tolerance = 0.01) {
    const sub = parseFloat(subtotal);
    const rate = parseFloat(taxRate);
    const tax = parseFloat(taxAmount);

    const expectedTax = formatAmount((sub * rate) / 100);
    const formattedTax = formatAmount(tax);

    if (Math.abs(formattedTax - expectedTax) > tolerance) {
      throw new Error(
        `Tax amount mismatch. Expected: ${expectedTax} (${sub} × ${rate}%), Got: ${formattedTax}`
      );
    }

    return true;
  }

  /**
   * Business Rule Validations
   */

  /**
   * Validate invoice against customer data
   */
  static validateInvoice(invoiceData, customer) {
    const errors = [];

    // Validate invoice date
    try {
      this.validateDocumentDate(invoiceData.invoiceDate, 'Invoice');
    } catch (error) {
      errors.push(error.message);
    }

    // Validate due date
    if (invoiceData.dueDate) {
      try {
        this.validateDueDate(invoiceData.invoiceDate, invoiceData.dueDate, 'Invoice');
      } catch (error) {
        errors.push(error.message);
      }
    }

    // Validate amounts
    try {
      this.validatePositiveAmount(invoiceData.total, 'Invoice total');
      this.validateNonNegativeAmount(invoiceData.subtotal, 'Invoice subtotal');
      this.validateNonNegativeAmount(invoiceData.taxAmount, 'Tax amount');
    } catch (error) {
      errors.push(error.message);
    }

    // Validate total calculation
    try {
      this.validateTotalCalculation(
        invoiceData.subtotal,
        invoiceData.taxAmount,
        invoiceData.discountValue || 0,
        invoiceData.total,
        'Invoice'
      );
    } catch (error) {
      errors.push(error.message);
    }

    // Validate discount percentage if provided
    if (invoiceData.discountType === 'Percentage' && invoiceData.discountValue) {
      try {
        this.validateDiscountPercentage(invoiceData.discountValue);
      } catch (error) {
        errors.push(error.message);
      }
    }

    // Validate tax rate
    if (invoiceData.taxRate) {
      try {
        this.validateTaxRate(invoiceData.taxRate);
      } catch (error) {
        errors.push(error.message);
      }
    }

    // Validate line items if provided
    if (invoiceData.items && invoiceData.items.length > 0) {
      try {
        const itemsTotal = invoiceData.items.reduce((sum, item) => sum + parseFloat(item.price || 0), 0);
        this.validateLineItemsTotal(
          invoiceData.items.map(item => ({ lineTotal: item.price })),
          invoiceData.subtotal,
          'Invoice'
        );
      } catch (error) {
        errors.push(error.message);
      }
    }

    // Check for errors
    if (errors.length > 0) {
      throw new Error(`Invoice validation failed:\n- ${errors.join('\n- ')}`);
    }

    return true;
  }

  /**
   * Validate bill against purchase order
   */
  static validateBill(billData, purchaseOrder) {
    const errors = [];

    // Validate bill date
    try {
      this.validateDocumentDate(billData.billDate, 'Bill');
    } catch (error) {
      errors.push(error.message);
    }

    // Validate due date if provided
    if (billData.dueDate) {
      try {
        this.validateDueDate(billData.billDate, billData.dueDate, 'Bill');
      } catch (error) {
        errors.push(error.message);
      }
    }

    // Validate amounts
    try {
      this.validatePositiveAmount(billData.total, 'Bill total');
      this.validateNonNegativeAmount(billData.subtotal, 'Bill subtotal');
      this.validateNonNegativeAmount(billData.taxAmount, 'Tax amount');
    } catch (error) {
      errors.push(error.message);
    }

    // Validate total calculation
    try {
      this.validateTotalCalculation(
        billData.subtotal,
        billData.taxAmount,
        0,
        billData.total,
        'Bill'
      );
    } catch (error) {
      errors.push(error.message);
    }

    // Validate bill doesn't exceed PO total
    if (purchaseOrder) {
      const currentBilled = parseFloat(purchaseOrder.billedAmount || 0);
      const newBillAmount = parseFloat(billData.total);
      const poTotal = parseFloat(purchaseOrder.total);
      const remainingAmount = poTotal - currentBilled;

      if (newBillAmount > remainingAmount + 0.01) {
        errors.push(
          `Bill total (${newBillAmount}) exceeds remaining PO balance (${remainingAmount}). ` +
          `PO Total: ${poTotal}, Already Billed: ${currentBilled}`
        );
      }
    }

    // Check for errors
    if (errors.length > 0) {
      throw new Error(`Bill validation failed:\n- ${errors.join('\n- ')}`);
    }

    return true;
  }

  /**
   * Validate payment data
   */
  static validatePayment(paymentData, document, documentType = 'Invoice') {
    const errors = [];

    // Validate payment date
    try {
      this.validateDocumentDate(paymentData.paymentDate, 'Payment');
    } catch (error) {
      errors.push(error.message);
    }

    // Validate payment date is not before document date
    try {
      this.validatePaymentDate(
        paymentData.paymentDate,
        document.invoiceDate || document.billDate,
        documentType
      );
    } catch (error) {
      errors.push(error.message);
    }

    // Validate payment amount
    try {
      this.validatePositiveAmount(paymentData.amount, 'Payment amount');
    } catch (error) {
      errors.push(error.message);
    }

    // Validate payment doesn't exceed remaining balance
    const total = parseFloat(document.total);
    const paid = parseFloat(document.paidAmount || 0);
    const remaining = total - paid;
    const paymentAmount = parseFloat(paymentData.amount);

    if (paymentAmount > remaining + 0.01) {
      errors.push(
        `Payment amount (${paymentAmount}) exceeds remaining balance (${remaining}). ` +
        `Total: ${total}, Paid: ${paid}`
      );
    }

    // Validate payment method is provided
    if (!paymentData.method || paymentData.method.trim() === '') {
      errors.push('Payment method is required');
    }

    // Check for errors
    if (errors.length > 0) {
      throw new Error(`Payment validation failed:\n- ${errors.join('\n- ')}`);
    }

    return true;
  }

  /**
   * Ledger Balance Reconciliation
   */

  /**
   * Reconcile customer ledger balance with customer.currentBalance
   * FIXED: Recalculates balance from complete ledger history instead of just checking latest entry
   */
  static async reconcileCustomerBalance(customerId) {
    // Use db.prisma for non-transactional read
    const prisma = db.prisma;

    // Get customer
    const customer = await prisma.customer.findUnique({
      where: { id: customerId }
    });

    if (!customer) {
      throw new Error(`Customer not found: ${customerId}`);
    }

    // FIXED: Calculate balance from SUM of all ledger entries (more reliable)
    const ledgerAggregate = await prisma.customerLedger.aggregate({
      where: { customerId },
      _sum: {
        debit: true,
        credit: true
      }
    });

    // Calculate expected balance using Decimal for precision
    const openingBalance = new Decimal(customer.openingBalance || 0);
    const totalDebit = new Decimal(ledgerAggregate._sum.debit || 0);
    const totalCredit = new Decimal(ledgerAggregate._sum.credit || 0);
    const calculatedBalance = openingBalance.plus(totalDebit).minus(totalCredit);
    const expectedBalance = parseFloat(calculatedBalance.toFixed(4));

    const customerBalance = parseFloat(customer.currentBalance);

    // Allow 1 cent tolerance
    const isReconciled = Math.abs(expectedBalance - customerBalance) <= 0.01;

    if (!isReconciled) {
      logger.warn('Customer ledger balance mismatch', {
        customerId,
        customerName: customer.name,
        openingBalance: customer.openingBalance,
        totalDebit: ledgerAggregate._sum.debit,
        totalCredit: ledgerAggregate._sum.credit,
        calculatedBalance: expectedBalance,
        customerBalance,
        difference: customerBalance - expectedBalance
      });

      return {
        isReconciled: false,
        customerBalance: customerBalance,
        ledgerBalance: expectedBalance,
        difference: customerBalance - expectedBalance
      };
    }

    return {
      isReconciled: true,
      customerBalance: customerBalance,
      ledgerBalance: expectedBalance,
      difference: 0
    };
  }

  /**
   * Auto-fix customer balance by recalculating from ledger
   *
   * CRITICAL WARNINGS:
   * - Only use this in a transaction to prevent race conditions
   * - This function modifies balance WITHOUT creating compensating ledger entries
   * - Use ONLY in data repair scenarios, not normal operations
   * - Violates audit trail integrity (balance change without ledger entry)
   *
   * WHEN TO USE:
   * - Database corruption detected (balance drift from ledger)
   * - Data migration/import corrections
   * - Manual fixes after system errors
   *
   * RECOMMENDED: After calling this, create a "Balance Adjustment" ledger entry:
   * ```
   * const adjustment = newBalance - oldBalance;
   * await tx.customerLedger.create({
   *   data: {
   *     customerId,
   *     entryDate: new Date(),
   *     description: 'Balance adjustment - System auto-fix',
   *     debit: adjustment > 0 ? adjustment : 0,
   *     credit: adjustment < 0 ? Math.abs(adjustment) : 0,
   *     balance: newBalance
   *   }
   * });
   * ```
   */
  static async autoFixCustomerBalance(tx, customerId) {
    const customer = await tx.customer.findUnique({
      where: { id: customerId }
    });

    if (!customer) {
      throw new Error(`Customer not found: ${customerId}`);
    }

    // Calculate correct balance from ledger
    const ledgerAggregate = await tx.customerLedger.aggregate({
      where: { customerId },
      _sum: {
        debit: true,
        credit: true
      }
    });

    const openingBalance = new Decimal(customer.openingBalance || 0);
    const totalDebit = new Decimal(ledgerAggregate._sum.debit || 0);
    const totalCredit = new Decimal(ledgerAggregate._sum.credit || 0);
    const correctBalance = openingBalance.plus(totalDebit).minus(totalCredit);
    const correctBalanceNumber = parseFloat(correctBalance.toFixed(4));

    // Update customer balance
    await tx.customer.update({
      where: { id: customerId },
      data: { currentBalance: correctBalanceNumber }
    });

    logger.info(`Auto-fixed customer balance`, {
      customerId,
      customerName: customer.name,
      oldBalance: customer.currentBalance,
      newBalance: correctBalanceNumber,
      difference: correctBalanceNumber - customer.currentBalance
    });

    return {
      customerId,
      oldBalance: customer.currentBalance,
      newBalance: correctBalanceNumber,
      fixed: true
    };
  }

  /**
   * Reconcile vendor ledger balance with vendor.currentBalance
   * FIXED: Recalculates balance from complete ledger history instead of just checking latest entry
   */
  static async reconcileVendorBalance(vendorId) {
    // Use db.prisma for non-transactional read
    const prisma = db.prisma;

    // Get vendor
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId }
    });

    if (!vendor) {
      throw new Error(`Vendor not found: ${vendorId}`);
    }

    // FIXED: Calculate balance from SUM of all ledger entries (more reliable)
    const ledgerAggregate = await prisma.vendorLedger.aggregate({
      where: { vendorId },
      _sum: {
        debit: true,
        credit: true
      }
    });

    // Calculate expected balance using Decimal for precision
    const openingBalance = new Decimal(vendor.openingBalance || 0);
    const totalDebit = new Decimal(ledgerAggregate._sum.debit || 0);
    const totalCredit = new Decimal(ledgerAggregate._sum.credit || 0);
    const calculatedBalance = openingBalance.plus(totalDebit).minus(totalCredit);
    const expectedBalance = parseFloat(calculatedBalance.toFixed(4));

    const vendorBalance = parseFloat(vendor.currentBalance);

    // Allow 1 cent tolerance
    const isReconciled = Math.abs(expectedBalance - vendorBalance) <= 0.01;

    if (!isReconciled) {
      logger.warn('Vendor ledger balance mismatch', {
        vendorId,
        vendorName: vendor.name,
        openingBalance: vendor.openingBalance,
        totalDebit: ledgerAggregate._sum.debit,
        totalCredit: ledgerAggregate._sum.credit,
        calculatedBalance: expectedBalance,
        vendorBalance,
        difference: vendorBalance - expectedBalance
      });

      return {
        isReconciled: false,
        vendorBalance: vendorBalance,
        ledgerBalance: expectedBalance,
        difference: vendorBalance - expectedBalance
      };
    }

    return {
      isReconciled: true,
      vendorBalance: vendorBalance,
      ledgerBalance: expectedBalance,
      difference: 0
    };
  }

  /**
   * Auto-fix vendor balance by recalculating from ledger
   *
   * CRITICAL WARNINGS:
   * - Only use this in a transaction to prevent race conditions
   * - This function modifies balance WITHOUT creating compensating ledger entries
   * - Use ONLY in data repair scenarios, not normal operations
   * - Violates audit trail integrity (balance change without ledger entry)
   *
   * WHEN TO USE:
   * - Database corruption detected (balance drift from ledger)
   * - Data migration/import corrections
   * - Manual fixes after system errors
   *
   * RECOMMENDED: After calling this, create a "Balance Adjustment" ledger entry:
   * ```
   * const adjustment = newBalance - oldBalance;
   * await tx.vendorLedger.create({
   *   data: {
   *     vendorId,
   *     entryDate: new Date(),
   *     description: 'Balance adjustment - System auto-fix',
   *     debit: adjustment > 0 ? adjustment : 0,
   *     credit: adjustment < 0 ? Math.abs(adjustment) : 0,
   *     balance: newBalance
   *   }
   * });
   * ```
   */
  static async autoFixVendorBalance(tx, vendorId) {
    const vendor = await tx.vendor.findUnique({
      where: { id: vendorId }
    });

    if (!vendor) {
      throw new Error(`Vendor not found: ${vendorId}`);
    }

    // Calculate correct balance from ledger
    const ledgerAggregate = await tx.vendorLedger.aggregate({
      where: { vendorId },
      _sum: {
        debit: true,
        credit: true
      }
    });

    const openingBalance = new Decimal(vendor.openingBalance || 0);
    const totalDebit = new Decimal(ledgerAggregate._sum.debit || 0);
    const totalCredit = new Decimal(ledgerAggregate._sum.credit || 0);
    const correctBalance = openingBalance.plus(totalDebit).minus(totalCredit);
    const correctBalanceNumber = parseFloat(correctBalance.toFixed(4));

    // Update vendor balance
    await tx.vendor.update({
      where: { id: vendorId },
      data: { currentBalance: correctBalanceNumber }
    });

    logger.info(`Auto-fixed vendor balance`, {
      vendorId,
      vendorName: vendor.name,
      oldBalance: vendor.currentBalance,
      newBalance: correctBalanceNumber,
      difference: correctBalanceNumber - vendor.currentBalance
    });

    return {
      vendorId,
      oldBalance: vendor.currentBalance,
      newBalance: correctBalanceNumber,
      fixed: true
    };
  }
}

module.exports = ValidationService;
