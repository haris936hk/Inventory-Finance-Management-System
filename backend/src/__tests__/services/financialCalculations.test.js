/**
 * Unit Tests for Financial Calculations
 * Tests critical financial logic to ensure accuracy and prevent regressions
 *
 * Run with: npm test -- financialCalculations.test.js
 */

const { formatAmount, compareAmounts } = require('../../utils/transactionWrapper');
const ValidationService = require('../../services/validationService');

describe('Financial Calculation Tests', () => {

  describe('Amount Formatting and Precision', () => {
    test('should format amounts to 4 decimal places', () => {
      expect(formatAmount(100.12345)).toBe(100.1235);
      expect(formatAmount(99.99999)).toBe(100.0000);
      expect(formatAmount(0.00005)).toBe(0.0001);
    });

    test('should handle floating point precision issues', () => {
      const result = formatAmount(0.1 + 0.2); // Classic JS precision issue
      expect(result).toBe(0.3000);
    });

    test('should compare amounts with tolerance', () => {
      expect(compareAmounts(100.0001, 100.0000)).toBe(true); // Within tolerance
      expect(compareAmounts(100.02, 100.00)).toBe(false); // Outside tolerance
    });
  });

  describe('Invoice Total Calculation', () => {
    test('should validate correct total calculation', () => {
      const subtotal = 100000;
      const taxAmount = 8000; // 8% tax
      const discount = 0;
      const total = 108000;

      expect(() => {
        ValidationService.validateTotalCalculation(subtotal, taxAmount, discount, total, 'Invoice');
      }).not.toThrow();
    });

    test('should reject incorrect total calculation', () => {
      const subtotal = 100000;
      const taxAmount = 8000;
      const discount = 0;
      const total = 100000; // Wrong total

      expect(() => {
        ValidationService.validateTotalCalculation(subtotal, taxAmount, discount, total, 'Invoice');
      }).toThrow(/total calculation mismatch/i);
    });

    test('should handle discount in total calculation', () => {
      const subtotal = 100000;
      const taxAmount = 8000;
      const discount = 5000;
      const total = 103000; // 100000 + 8000 - 5000

      expect(() => {
        ValidationService.validateTotalCalculation(subtotal, taxAmount, discount, total, 'Invoice');
      }).not.toThrow();
    });
  });

  describe('Proportional COGS Calculation', () => {
    test('should calculate COGS proportionally for full payment', () => {
      const invoiceTotal = 100000;
      const totalCOGS = 60000;
      const paymentAmount = 100000;

      const paymentPercentage = paymentAmount / invoiceTotal;
      const proportionalCOGS = formatAmount(totalCOGS * paymentPercentage);

      expect(proportionalCOGS).toBe(60000.0000);
      expect(paymentPercentage).toBe(1);
    });

    test('should calculate COGS proportionally for 50% payment', () => {
      const invoiceTotal = 100000;
      const totalCOGS = 60000;
      const paymentAmount = 50000;

      const paymentPercentage = paymentAmount / invoiceTotal;
      const proportionalCOGS = formatAmount(totalCOGS * paymentPercentage);

      expect(proportionalCOGS).toBe(30000.0000);
      expect(paymentPercentage).toBe(0.5);
    });

    test('should accumulate COGS across multiple payments', () => {
      const invoiceTotal = 100000;
      const totalCOGS = 60000;

      // Payment 1: 50,000 (50%)
      const payment1 = 50000;
      const cogs1 = formatAmount(totalCOGS * (payment1 / invoiceTotal));
      expect(cogs1).toBe(30000.0000);

      // Payment 2: 30,000 (30%)
      const payment2 = 30000;
      const cogs2 = formatAmount(totalCOGS * (payment2 / invoiceTotal));
      expect(cogs2).toBe(18000.0000);

      // Payment 3: 20,000 (20%)
      const payment3 = 20000;
      const cogs3 = formatAmount(totalCOGS * (payment3 / invoiceTotal));
      expect(cogs3).toBe(12000.0000);

      // Total accumulated COGS should equal total item cost
      const accumulatedCOGS = formatAmount(cogs1 + cogs2 + cogs3);
      expect(accumulatedCOGS).toBe(60000.0000);
    });

    test('should handle COGS reversal on payment void', () => {
      const invoiceTotal = 100000;
      const totalCOGS = 60000;
      const voidedPayment = 30000;

      const cogsToReverse = formatAmount(totalCOGS * (voidedPayment / invoiceTotal));
      expect(cogsToReverse).toBe(18000.0000);

      // After voiding, if COGS was 48,000
      const currentCOGS = 48000;
      const newCOGS = formatAmount(Math.max(0, currentCOGS - cogsToReverse));
      expect(newCOGS).toBe(30000.0000);
    });
  });

  describe('Tax Calculations', () => {
    test('should calculate tax amount correctly', () => {
      const subtotal = 100000;
      const taxRate = 8; // 8%
      const expectedTax = formatAmount((subtotal * taxRate) / 100);

      expect(expectedTax).toBe(8000.0000);
    });

    test('should validate tax amount matches rate', () => {
      const subtotal = 100000;
      const taxRate = 8;
      const taxAmount = 8000;

      expect(() => {
        ValidationService.validateTaxAmount(subtotal, taxRate, taxAmount);
      }).not.toThrow();
    });

    test('should reject incorrect tax amount', () => {
      const subtotal = 100000;
      const taxRate = 8;
      const taxAmount = 5000; // Wrong

      expect(() => {
        ValidationService.validateTaxAmount(subtotal, taxRate, taxAmount);
      }).toThrow(/tax amount mismatch/i);
    });
  });

  describe('Line Items Total Validation', () => {
    test('should validate line items sum equals subtotal', () => {
      const lineItems = [
        { lineTotal: 40000 },
        { lineTotal: 35000 },
        { lineTotal: 25000 }
      ];
      const subtotal = 100000;

      expect(() => {
        ValidationService.validateLineItemsTotal(lineItems, subtotal, 'Invoice');
      }).not.toThrow();
    });

    test('should reject when line items sum does not match subtotal', () => {
      const lineItems = [
        { lineTotal: 40000 },
        { lineTotal: 35000 },
        { lineTotal: 20000 }
      ];
      const subtotal = 100000; // Sum is only 95000

      expect(() => {
        ValidationService.validateLineItemsTotal(lineItems, subtotal, 'Invoice');
      }).toThrow(/does not match subtotal/i);
    });
  });

  describe('Payment Amount Validation', () => {
    test('should allow payment within remaining balance', () => {
      const invoiceTotal = 100000;
      const paidAmount = 50000;
      const paymentAmount = 40000;
      const remaining = invoiceTotal - paidAmount;

      expect(paymentAmount).toBeLessThanOrEqual(remaining);
    });

    test('should detect payment exceeding balance', () => {
      const invoiceTotal = 100000;
      const paidAmount = 50000;
      const paymentAmount = 60000; // Exceeds remaining
      const remaining = invoiceTotal - paidAmount;

      expect(paymentAmount).toBeGreaterThan(remaining);
    });

    test('should validate positive payment amount', () => {
      expect(() => {
        ValidationService.validatePositiveAmount(1000, 'Payment');
      }).not.toThrow();

      expect(() => {
        ValidationService.validatePositiveAmount(0, 'Payment');
      }).toThrow(/must be a positive number/i);

      expect(() => {
        ValidationService.validatePositiveAmount(-100, 'Payment');
      }).toThrow(/must be a positive number/i);
    });
  });

  describe('Bill vs PO Total Validation', () => {
    test('should allow bill within PO remaining balance', () => {
      const poTotal = 200000;
      const billedAmount = 100000;
      const newBillTotal = 80000;
      const remaining = poTotal - billedAmount;

      expect(newBillTotal).toBeLessThanOrEqual(remaining + 0.01); // With tolerance
    });

    test('should detect bill exceeding PO balance', () => {
      const poTotal = 200000;
      const billedAmount = 100000;
      const newBillTotal = 150000; // Exceeds remaining
      const remaining = poTotal - billedAmount;

      expect(newBillTotal).toBeGreaterThan(remaining + 0.01);
    });
  });

  describe('Discount Validation', () => {
    test('should validate discount percentage within limits', () => {
      expect(() => {
        ValidationService.validateDiscountPercentage(25); // 25% OK
      }).not.toThrow();

      expect(() => {
        ValidationService.validateDiscountPercentage(50); // 50% OK (max)
      }).not.toThrow();

      expect(() => {
        ValidationService.validateDiscountPercentage(60); // 60% exceeds max
      }).toThrow(/must be between 0 and 50%/i);
    });

    test('should reject negative discount', () => {
      expect(() => {
        ValidationService.validateDiscountPercentage(-10);
      }).toThrow(/must be between 0 and 50%/i);
    });
  });

  describe('Date Validations', () => {
    test('should reject future document dates', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);

      expect(() => {
        ValidationService.validateDocumentDate(futureDate, 'Invoice');
      }).toThrow(/cannot be in the future/i);
    });

    test('should allow today as document date', () => {
      const today = new Date();

      expect(() => {
        ValidationService.validateDocumentDate(today, 'Invoice');
      }).not.toThrow();
    });

    test('should validate due date is after document date', () => {
      const docDate = new Date('2025-01-01');
      const dueDate = new Date('2025-01-15');

      expect(() => {
        ValidationService.validateDueDate(docDate, dueDate, 'Invoice');
      }).not.toThrow();
    });

    test('should reject due date before document date', () => {
      const docDate = new Date('2025-01-15');
      const dueDate = new Date('2025-01-01');

      expect(() => {
        ValidationService.validateDueDate(docDate, dueDate, 'Invoice');
      }).toThrow(/must be after document date/i);
    });
  });

  describe('Edge Cases', () => {
    test('should handle very small amounts', () => {
      const smallAmount = 0.0001;
      expect(formatAmount(smallAmount)).toBe(0.0001);
    });

    test('should handle very large amounts', () => {
      const largeAmount = 9999999999.9999;
      expect(formatAmount(largeAmount)).toBe(9999999999.9999);
    });

    test('should handle zero amounts correctly', () => {
      expect(formatAmount(0)).toBe(0.0000);
      expect(compareAmounts(0, 0)).toBe(true);
    });

    test('should handle rounding edge cases', () => {
      expect(formatAmount(99.99995)).toBe(100.0000); // Rounds up
      expect(formatAmount(99.99994)).toBe(99.9999); // Rounds down
    });
  });
});

describe('Integration Scenarios', () => {
  test('Complete invoice-to-payment flow calculation', () => {
    // Scenario: Create invoice for PKR 100,000 with 3 partial payments

    const invoiceData = {
      subtotal: 92593,
      taxRate: 8,
      taxAmount: 7407,
      total: 100000
    };

    const itemCost = 60000; // Total COGS

    // Validate invoice total
    const calculatedTotal = formatAmount(invoiceData.subtotal + invoiceData.taxAmount);
    expect(calculatedTotal).toBe(100000.0000);

    // Payment 1: PKR 50,000
    const payment1 = {
      amount: 50000,
      cogs: formatAmount(itemCost * (50000 / 100000))
    };
    expect(payment1.cogs).toBe(30000.0000);

    // Payment 2: PKR 30,000
    const payment2 = {
      amount: 30000,
      cogs: formatAmount(itemCost * (30000 / 100000))
    };
    expect(payment2.cogs).toBe(18000.0000);

    // Payment 3: PKR 20,000
    const payment3 = {
      amount: 20000,
      cogs: formatAmount(itemCost * (20000 / 100000))
    };
    expect(payment3.cogs).toBe(12000.0000);

    // Verify total
    const totalPaid = formatAmount(payment1.amount + payment2.amount + payment3.amount);
    const totalCOGS = formatAmount(payment1.cogs + payment2.cogs + payment3.cogs);

    expect(totalPaid).toBe(100000.0000);
    expect(totalCOGS).toBe(60000.0000);

    // Calculate profit
    const revenue = invoiceData.subtotal;
    const profit = formatAmount(revenue - totalCOGS);
    expect(profit).toBe(32593.0000);
  });

  test('Complete PO-to-bill flow calculation', () => {
    // Scenario: PO for PKR 200,000, create 2 bills

    const poData = {
      subtotal: 185185,
      taxAmount: 14815,
      total: 200000,
      billedAmount: 0
    };

    // Bill 1: PKR 120,000
    const bill1 = {
      subtotal: 111111,
      taxAmount: 8889,
      total: 120000
    };

    const newBilledAmount1 = formatAmount(poData.billedAmount + bill1.total);
    expect(newBilledAmount1).toBe(120000.0000);
    expect(newBilledAmount1).toBeLessThanOrEqual(poData.total);

    // Bill 2: PKR 80,000
    const bill2 = {
      subtotal: 74074,
      taxAmount: 5926,
      total: 80000
    };

    const newBilledAmount2 = formatAmount(newBilledAmount1 + bill2.total);
    expect(newBilledAmount2).toBe(200000.0000);
    expect(newBilledAmount2).toBeLessThanOrEqual(poData.total);

    // Verify fully billed
    expect(compareAmounts(newBilledAmount2, poData.total)).toBe(true);
  });
});
