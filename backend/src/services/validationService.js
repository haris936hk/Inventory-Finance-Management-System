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
const { formatAmount, compareAmounts } = require('../utils/transactionWrapper');

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
   */
  static async reconcileCustomerBalance(tx, customerId) {
    // Get customer
    const customer = await tx.customer.findUnique({
      where: { id: customerId }
    });

    if (!customer) {
      throw new Error(`Customer not found: ${customerId}`);
    }

    // Get latest ledger entry
    const latestLedgerEntry = await tx.customerLedger.findFirst({
      where: { customerId },
      orderBy: { entryDate: 'desc' }
    });

    if (!latestLedgerEntry) {
      // No ledger entries, balance should be opening balance
      const expectedBalance = parseFloat(customer.openingBalance || 0);
      const actualBalance = parseFloat(customer.currentBalance);

      if (Math.abs(actualBalance - expectedBalance) > 0.01) {
        logger.warn('Customer balance mismatch (no ledger entries)', {
          customerId,
          expectedBalance,
          actualBalance,
          difference: actualBalance - expectedBalance
        });

        return {
          isBalanced: false,
          expected: expectedBalance,
          actual: actualBalance,
          difference: actualBalance - expectedBalance
        };
      }

      return { isBalanced: true, expected: expectedBalance, actual: actualBalance };
    }

    // Compare ledger balance with customer balance
    const ledgerBalance = parseFloat(latestLedgerEntry.balance);
    const customerBalance = parseFloat(customer.currentBalance);

    if (Math.abs(ledgerBalance - customerBalance) > 0.01) {
      logger.warn('Customer ledger balance mismatch', {
        customerId,
        customerName: customer.name,
        ledgerBalance,
        customerBalance,
        difference: customerBalance - ledgerBalance,
        lastLedgerEntry: latestLedgerEntry.id,
        lastLedgerDate: latestLedgerEntry.entryDate
      });

      return {
        isBalanced: false,
        expected: ledgerBalance,
        actual: customerBalance,
        difference: customerBalance - ledgerBalance
      };
    }

    return { isBalanced: true, expected: ledgerBalance, actual: customerBalance };
  }

  /**
   * Reconcile vendor ledger balance with vendor.currentBalance
   */
  static async reconcileVendorBalance(tx, vendorId) {
    // Get vendor
    const vendor = await tx.vendor.findUnique({
      where: { id: vendorId }
    });

    if (!vendor) {
      throw new Error(`Vendor not found: ${vendorId}`);
    }

    // Get latest ledger entry
    const latestLedgerEntry = await tx.vendorLedger.findFirst({
      where: { vendorId },
      orderBy: { entryDate: 'desc' }
    });

    if (!latestLedgerEntry) {
      // No ledger entries, balance should be opening balance
      const expectedBalance = parseFloat(vendor.openingBalance || 0);
      const actualBalance = parseFloat(vendor.currentBalance);

      if (Math.abs(actualBalance - expectedBalance) > 0.01) {
        logger.warn('Vendor balance mismatch (no ledger entries)', {
          vendorId,
          expectedBalance,
          actualBalance,
          difference: actualBalance - expectedBalance
        });

        return {
          isBalanced: false,
          expected: expectedBalance,
          actual: actualBalance,
          difference: actualBalance - expectedBalance
        };
      }

      return { isBalanced: true, expected: expectedBalance, actual: actualBalance };
    }

    // Compare ledger balance with vendor balance
    const ledgerBalance = parseFloat(latestLedgerEntry.balance);
    const vendorBalance = parseFloat(vendor.currentBalance);

    if (Math.abs(ledgerBalance - vendorBalance) > 0.01) {
      logger.warn('Vendor ledger balance mismatch', {
        vendorId,
        vendorName: vendor.name,
        ledgerBalance,
        vendorBalance,
        difference: vendorBalance - ledgerBalance,
        lastLedgerEntry: latestLedgerEntry.id,
        lastLedgerDate: latestLedgerEntry.entryDate
      });

      return {
        isBalanced: false,
        expected: ledgerBalance,
        actual: vendorBalance,
        difference: vendorBalance - ledgerBalance
      };
    }

    return { isBalanced: true, expected: ledgerBalance, actual: vendorBalance };
  }
}

module.exports = ValidationService;
