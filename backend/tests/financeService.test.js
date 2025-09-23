const FinanceService = require('../src/services/financeService');

// Mock the generateId utility
jest.mock('../src/utils/generateId', () => ({
  generateInvoiceNumber: jest.fn(() => 'INV-2023-001'),
  generatePONumber: jest.fn(() => 'PO-2023-001'),
  generatePaymentNumber: jest.fn(() => 'PAY-2023-001')
}));

describe('FinanceService', () => {
  let financeService;

  beforeEach(() => {
    financeService = new FinanceService();
  });

  describe('Customer Management', () => {
    describe('createCustomer', () => {
      it('should create a new customer successfully', async () => {
        const customerData = {
          name: 'John Doe',
          phone: '1234567890',
          email: 'john@example.com',
          company: 'ABC Corp',
          address: '123 Main St',
          creditLimit: 10000,
          openingBalance: 0
        };

        mockPrisma.customer.findUnique.mockResolvedValue(null);
        mockPrisma.customer.create.mockResolvedValue({
          id: 'cust-123',
          ...customerData,
          currentBalance: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        });

        const result = await financeService.createCustomer(customerData);

        expect(mockPrisma.customer.findUnique).toHaveBeenCalledWith({
          where: { phone: '1234567890' }
        });
        expect(mockPrisma.customer.create).toHaveBeenCalledWith({
          data: customerData
        });
        expect(result.name).toBe('John Doe');
      });

      it('should throw error when phone number already exists', async () => {
        const customerData = {
          name: 'John Doe',
          phone: '1234567890',
          email: 'john@example.com'
        };

        mockPrisma.customer.findUnique.mockResolvedValue({
          id: 'existing-customer',
          phone: '1234567890'
        });

        await expect(financeService.createCustomer(customerData))
          .rejects.toThrow('Customer with this phone number already exists');

        expect(mockPrisma.customer.create).not.toHaveBeenCalled();
      });
    });

    describe('getCustomers', () => {
      it('should return all customers with counts', async () => {
        const mockCustomers = [
          {
            id: 'cust-1',
            name: 'John Doe',
            phone: '1234567890',
            _count: { invoices: 5, payments: 3 }
          },
          {
            id: 'cust-2',
            name: 'Jane Smith',
            phone: '0987654321',
            _count: { invoices: 2, payments: 2 }
          }
        ];

        mockPrisma.customer.findMany.mockResolvedValue(mockCustomers);

        const result = await financeService.getCustomers();

        expect(mockPrisma.customer.findMany).toHaveBeenCalledWith({
          where: { deletedAt: null },
          include: {
            _count: {
              select: {
                invoices: true,
                payments: true
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        });
        expect(result).toEqual(mockCustomers);
      });

      it('should filter customers by search term', async () => {
        const searchTerm = 'john';
        const mockCustomers = [
          {
            id: 'cust-1',
            name: 'John Doe',
            phone: '1234567890',
            _count: { invoices: 5, payments: 3 }
          }
        ];

        mockPrisma.customer.findMany.mockResolvedValue(mockCustomers);

        const result = await financeService.getCustomers({ search: searchTerm });

        expect(mockPrisma.customer.findMany).toHaveBeenCalledWith({
          where: {
            deletedAt: null,
            OR: [
              { name: { contains: searchTerm, mode: 'insensitive' } },
              { phone: { contains: searchTerm, mode: 'insensitive' } },
              { company: { contains: searchTerm, mode: 'insensitive' } }
            ]
          },
          include: {
            _count: {
              select: {
                invoices: true,
                payments: true
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        });
        expect(result).toEqual(mockCustomers);
      });
    });
  });

  describe('Invoice Management', () => {
    describe('createInvoice', () => {
      it('should create invoice with calculated totals', async () => {
        const invoiceData = {
          customerId: 'cust-123',
          invoiceDate: new Date(),
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          items: [
            {
              itemId: 'item-1',
              quantity: 2,
              unitPrice: 100.00,
              description: 'Test Item 1'
            },
            {
              itemId: 'item-2',
              quantity: 1,
              unitPrice: 150.00,
              description: 'Test Item 2'
            }
          ],
          taxRate: 18.0,
          discountValue: 10.0,
          discountType: 'Fixed',
          createdById: 'user-123'
        };

        const expectedInvoice = {
          id: 'inv-123',
          invoiceNumber: 'INV-2023-001',
          subtotal: 350.00, // (2*100) + (1*150)
          discountValue: 10.0,
          taxAmount: 61.20, // (350-10) * 0.18
          total: 401.20, // 350 - 10 + 61.20
          status: 'Draft',
          paidAmount: 0
        };

        mockPrisma.$transaction.mockResolvedValue(expectedInvoice);

        const result = await financeService.createInvoice(invoiceData);

        expect(mockPrisma.$transaction).toHaveBeenCalled();
        expect(result).toEqual(expectedInvoice);
      });

      it('should calculate percentage discount correctly', async () => {
        const invoiceData = {
          customerId: 'cust-123',
          items: [
            { itemId: 'item-1', quantity: 1, unitPrice: 100.00 }
          ],
          taxRate: 10.0,
          discountValue: 20.0,
          discountType: 'Percentage',
          createdById: 'user-123'
        };

        const expectedCalculations = {
          subtotal: 100.00,
          discountAmount: 20.00, // 100 * 0.20
          taxableAmount: 80.00, // 100 - 20
          taxAmount: 8.00, // 80 * 0.10
          total: 88.00 // 80 + 8
        };

        mockPrisma.$transaction.mockImplementation(async (callback) => {
          const calculations = financeService.calculateInvoiceTotals(
            invoiceData.items,
            invoiceData.taxRate,
            invoiceData.discountValue,
            invoiceData.discountType
          );
          return { ...expectedCalculations, calculations };
        });

        const result = await financeService.createInvoice(invoiceData);

        expect(result.calculations.subtotal).toBe(100.00);
        expect(result.calculations.discountAmount).toBe(20.00);
        expect(result.calculations.taxAmount).toBe(8.00);
        expect(result.calculations.total).toBe(88.00);
      });

      it('should validate invoice items before creation', async () => {
        const invalidInvoiceData = {
          customerId: 'cust-123',
          items: [], // Empty items array
          createdById: 'user-123'
        };

        await expect(financeService.createInvoice(invalidInvoiceData))
          .rejects.toThrow('Invoice must have at least one item');

        expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      });
    });

    describe('calculateInvoiceTotals', () => {
      it('should calculate totals correctly with fixed discount', () => {
        const items = [
          { quantity: 2, unitPrice: 100.00 },
          { quantity: 1, unitPrice: 50.00 }
        ];
        const taxRate = 10.0;
        const discountValue = 25.0;
        const discountType = 'Fixed';

        const result = financeService.calculateInvoiceTotals(
          items, taxRate, discountValue, discountType
        );

        expect(result.subtotal).toBe(250.00); // (2*100) + (1*50)
        expect(result.discountAmount).toBe(25.00);
        expect(result.taxableAmount).toBe(225.00); // 250 - 25
        expect(result.taxAmount).toBe(22.50); // 225 * 0.10
        expect(result.total).toBe(247.50); // 225 + 22.50
      });

      it('should calculate totals correctly with percentage discount', () => {
        const items = [
          { quantity: 1, unitPrice: 200.00 }
        ];
        const taxRate = 15.0;
        const discountValue = 10.0;
        const discountType = 'Percentage';

        const result = financeService.calculateInvoiceTotals(
          items, taxRate, discountValue, discountType
        );

        expect(result.subtotal).toBe(200.00);
        expect(result.discountAmount).toBe(20.00); // 200 * 0.10
        expect(result.taxableAmount).toBe(180.00); // 200 - 20
        expect(result.taxAmount).toBe(27.00); // 180 * 0.15
        expect(result.total).toBe(207.00); // 180 + 27
      });

      it('should handle zero discount', () => {
        const items = [
          { quantity: 1, unitPrice: 100.00 }
        ];
        const taxRate = 5.0;
        const discountValue = 0;
        const discountType = 'Fixed';

        const result = financeService.calculateInvoiceTotals(
          items, taxRate, discountValue, discountType
        );

        expect(result.subtotal).toBe(100.00);
        expect(result.discountAmount).toBe(0);
        expect(result.taxableAmount).toBe(100.00);
        expect(result.taxAmount).toBe(5.00);
        expect(result.total).toBe(105.00);
      });

      it('should handle zero tax rate', () => {
        const items = [
          { quantity: 1, unitPrice: 100.00 }
        ];
        const taxRate = 0;
        const discountValue = 10.0;
        const discountType = 'Fixed';

        const result = financeService.calculateInvoiceTotals(
          items, taxRate, discountValue, discountType
        );

        expect(result.subtotal).toBe(100.00);
        expect(result.discountAmount).toBe(10.00);
        expect(result.taxableAmount).toBe(90.00);
        expect(result.taxAmount).toBe(0);
        expect(result.total).toBe(90.00);
      });
    });
  });

  describe('Payment Management', () => {
    describe('createPayment', () => {
      it('should create payment and update invoice balance', async () => {
        const paymentData = {
          customerId: 'cust-123',
          invoiceId: 'inv-123',
          amount: 500.00,
          method: 'Bank Transfer',
          reference: 'TXN-12345',
          notes: 'Payment received',
          recordedById: 'user-123'
        };

        const mockInvoice = {
          id: 'inv-123',
          total: 1000.00,
          paidAmount: 200.00,
          status: 'Partial'
        };

        const expectedPayment = {
          id: 'pay-123',
          paymentNumber: 'PAY-2023-001',
          ...paymentData,
          paymentDate: expect.any(Date),
          createdAt: expect.any(Date)
        };

        mockPrisma.invoice.findUnique.mockResolvedValue(mockInvoice);
        mockPrisma.$transaction.mockResolvedValue({
          payment: expectedPayment,
          updatedInvoice: {
            ...mockInvoice,
            paidAmount: 700.00,
            status: 'Partial'
          }
        });

        const result = await financeService.createPayment(paymentData);

        expect(mockPrisma.invoice.findUnique).toHaveBeenCalledWith({
          where: { id: 'inv-123' }
        });
        expect(mockPrisma.$transaction).toHaveBeenCalled();
        expect(result.payment.amount).toBe(500.00);
      });

      it('should mark invoice as paid when fully paid', async () => {
        const paymentData = {
          customerId: 'cust-123',
          invoiceId: 'inv-123',
          amount: 300.00,
          method: 'Cash',
          recordedById: 'user-123'
        };

        const mockInvoice = {
          id: 'inv-123',
          total: 500.00,
          paidAmount: 200.00,
          status: 'Partial'
        };

        mockPrisma.invoice.findUnique.mockResolvedValue(mockInvoice);
        mockPrisma.$transaction.mockResolvedValue({
          payment: { id: 'pay-123', amount: 300.00 },
          updatedInvoice: {
            ...mockInvoice,
            paidAmount: 500.00,
            status: 'Paid'
          }
        });

        const result = await financeService.createPayment(paymentData);

        expect(result.updatedInvoice.status).toBe('Paid');
        expect(result.updatedInvoice.paidAmount).toBe(500.00);
      });

      it('should throw error for overpayment', async () => {
        const paymentData = {
          customerId: 'cust-123',
          invoiceId: 'inv-123',
          amount: 600.00,
          method: 'Cash',
          recordedById: 'user-123'
        };

        const mockInvoice = {
          id: 'inv-123',
          total: 500.00,
          paidAmount: 200.00,
          status: 'Partial'
        };

        mockPrisma.invoice.findUnique.mockResolvedValue(mockInvoice);

        await expect(financeService.createPayment(paymentData))
          .rejects.toThrow('Payment amount exceeds remaining balance');

        expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      });

      it('should throw error for payment on fully paid invoice', async () => {
        const paymentData = {
          customerId: 'cust-123',
          invoiceId: 'inv-123',
          amount: 100.00,
          method: 'Cash',
          recordedById: 'user-123'
        };

        const mockInvoice = {
          id: 'inv-123',
          total: 500.00,
          paidAmount: 500.00,
          status: 'Paid'
        };

        mockPrisma.invoice.findUnique.mockResolvedValue(mockInvoice);

        await expect(financeService.createPayment(paymentData))
          .rejects.toThrow('Invoice is already fully paid');

        expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      });
    });
  });

  describe('Customer Statement', () => {
    describe('getCustomerStatement', () => {
      it('should return customer statement with transactions', async () => {
        const customerId = 'cust-123';
        const fromDate = new Date('2023-01-01');
        const toDate = new Date('2023-12-31');

        const mockStatement = {
          customer: {
            id: 'cust-123',
            name: 'John Doe',
            openingBalance: 1000.00,
            currentBalance: 1500.00
          },
          transactions: [
            {
              date: new Date('2023-06-15'),
              type: 'Invoice',
              reference: 'INV-2023-001',
              debit: 500.00,
              credit: 0,
              balance: 1500.00
            },
            {
              date: new Date('2023-06-20'),
              type: 'Payment',
              reference: 'PAY-2023-001',
              debit: 0,
              credit: 200.00,
              balance: 1300.00
            }
          ],
          summary: {
            openingBalance: 1000.00,
            totalInvoices: 500.00,
            totalPayments: 200.00,
            closingBalance: 1300.00
          }
        };

        mockPrisma.customer.findUnique.mockResolvedValue(mockStatement.customer);

        // Mock the complex query for statement transactions
        const mockLedgerEntries = [
          {
            entryDate: new Date('2023-06-15'),
            description: 'Invoice INV-2023-001',
            debit: 500.00,
            credit: 0,
            balance: 1500.00,
            invoice: { invoiceNumber: 'INV-2023-001' }
          },
          {
            entryDate: new Date('2023-06-20'),
            description: 'Payment PAY-2023-001',
            debit: 0,
            credit: 200.00,
            balance: 1300.00,
            payment: { paymentNumber: 'PAY-2023-001' }
          }
        ];

        mockPrisma.customerLedger.findMany.mockResolvedValue(mockLedgerEntries);

        const result = await financeService.getCustomerStatement(
          customerId, fromDate, toDate
        );

        expect(mockPrisma.customer.findUnique).toHaveBeenCalledWith({
          where: { id: customerId }
        });
        expect(mockPrisma.customerLedger.findMany).toHaveBeenCalledWith({
          where: {
            customerId,
            entryDate: {
              gte: fromDate,
              lte: toDate
            }
          },
          include: {
            invoice: { select: { invoiceNumber: true } },
            payment: { select: { paymentNumber: true } }
          },
          orderBy: { entryDate: 'asc' }
        });

        expect(result.customer).toEqual(mockStatement.customer);
        expect(result.transactions).toHaveLength(2);
      });
    });
  });

  describe('Financial Calculations', () => {
    describe('calculateItemTotal', () => {
      it('should calculate item total correctly', () => {
        const quantity = 3;
        const unitPrice = 25.50;

        const result = financeService.calculateItemTotal(quantity, unitPrice);

        expect(result).toBe(76.50);
      });

      it('should handle decimal quantities', () => {
        const quantity = 2.5;
        const unitPrice = 10.00;

        const result = financeService.calculateItemTotal(quantity, unitPrice);

        expect(result).toBe(25.00);
      });
    });

    describe('calculateTaxAmount', () => {
      it('should calculate tax amount correctly', () => {
        const taxableAmount = 100.00;
        const taxRate = 15.0;

        const result = financeService.calculateTaxAmount(taxableAmount, taxRate);

        expect(result).toBe(15.00);
      });

      it('should handle zero tax rate', () => {
        const taxableAmount = 100.00;
        const taxRate = 0;

        const result = financeService.calculateTaxAmount(taxableAmount, taxRate);

        expect(result).toBe(0);
      });
    });

    describe('calculateDiscountAmount', () => {
      it('should calculate fixed discount correctly', () => {
        const subtotal = 100.00;
        const discountValue = 15.00;
        const discountType = 'Fixed';

        const result = financeService.calculateDiscountAmount(
          subtotal, discountValue, discountType
        );

        expect(result).toBe(15.00);
      });

      it('should calculate percentage discount correctly', () => {
        const subtotal = 200.00;
        const discountValue = 25.0;
        const discountType = 'Percentage';

        const result = financeService.calculateDiscountAmount(
          subtotal, discountValue, discountType
        );

        expect(result).toBe(50.00);
      });

      it('should cap discount at subtotal amount', () => {
        const subtotal = 100.00;
        const discountValue = 150.00;
        const discountType = 'Fixed';

        const result = financeService.calculateDiscountAmount(
          subtotal, discountValue, discountType
        );

        expect(result).toBe(100.00);
      });
    });
  });
});