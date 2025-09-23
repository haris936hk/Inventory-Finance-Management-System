const InstallmentService = require('../src/services/installmentService');

describe('InstallmentService', () => {
  let installmentService;

  beforeEach(() => {
    installmentService = new InstallmentService();
  });

  describe('createInstallmentPlan', () => {
    it('should create installment plan with monthly intervals', async () => {
      const invoiceId = 'inv-123';
      const planData = {
        downPayment: 2000.00,
        numberOfInstallments: 6,
        intervalType: 'Monthly',
        startDate: new Date('2023-07-01'),
        notes: 'Monthly payment plan'
      };
      const userId = 'user-123';

      const mockInvoice = {
        id: invoiceId,
        total: 12000.00,
        hasInstallment: false,
        customer: {
          id: 'cust-123',
          name: 'John Doe'
        }
      };

      const mockPlan = {
        id: 'plan-123',
        invoiceId,
        totalAmount: 12000.00,
        downPayment: 2000.00,
        numberOfInstallments: 6,
        intervalType: 'Monthly',
        startDate: new Date('2023-07-01')
      };

      const mockInstallments = [
        {
          id: 'inst-1',
          installmentNumber: 1,
          dueDate: new Date('2023-08-01'),
          amount: 1666.67,
          status: 'Pending'
        },
        {
          id: 'inst-2',
          installmentNumber: 2,
          dueDate: new Date('2023-09-01'),
          amount: 1666.67,
          status: 'Pending'
        }
      ];

      mockPrisma.invoice.findUnique.mockResolvedValue(mockInvoice);
      mockPrisma.$transaction.mockResolvedValue({
        plan: mockPlan,
        installments: mockInstallments
      });

      const result = await installmentService.createInstallmentPlan(
        invoiceId, planData, userId
      );

      expect(mockPrisma.invoice.findUnique).toHaveBeenCalledWith({
        where: { id: invoiceId },
        include: { customer: true }
      });
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(result.plan.totalAmount).toBe(12000.00);
      expect(result.plan.downPayment).toBe(2000.00);
    });

    it('should create installment plan with weekly intervals', async () => {
      const invoiceId = 'inv-123';
      const planData = {
        downPayment: 1000.00,
        numberOfInstallments: 4,
        intervalType: 'Weekly',
        startDate: new Date('2023-07-01')
      };

      const mockInvoice = {
        id: invoiceId,
        total: 5000.00,
        hasInstallment: false,
        customer: { id: 'cust-123' }
      };

      mockPrisma.invoice.findUnique.mockResolvedValue(mockInvoice);
      mockPrisma.$transaction.mockResolvedValue({
        plan: { intervalType: 'Weekly' },
        installments: []
      });

      const result = await installmentService.createInstallmentPlan(
        invoiceId, planData, 'user-123'
      );

      expect(result.plan.intervalType).toBe('Weekly');
    });

    it('should throw error when invoice not found', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue(null);

      await expect(installmentService.createInstallmentPlan(
        'nonexistent', {}, 'user-123'
      )).rejects.toThrow('Invoice not found');

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('should throw error when invoice already has installment plan', async () => {
      const mockInvoice = {
        id: 'inv-123',
        total: 5000.00,
        hasInstallment: true
      };

      mockPrisma.invoice.findUnique.mockResolvedValue(mockInvoice);

      await expect(installmentService.createInstallmentPlan(
        'inv-123', {}, 'user-123'
      )).rejects.toThrow('Invoice already has an installment plan');

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('should throw error when down payment exceeds total amount', async () => {
      const mockInvoice = {
        id: 'inv-123',
        total: 1000.00,
        hasInstallment: false
      };

      const planData = {
        downPayment: 1500.00,
        numberOfInstallments: 3
      };

      mockPrisma.invoice.findUnique.mockResolvedValue(mockInvoice);

      await expect(installmentService.createInstallmentPlan(
        'inv-123', planData, 'user-123'
      )).rejects.toThrow('Down payment cannot be greater than or equal to total amount');
    });

    it('should throw error when down payment equals total amount', async () => {
      const mockInvoice = {
        id: 'inv-123',
        total: 1000.00,
        hasInstallment: false
      };

      const planData = {
        downPayment: 1000.00,
        numberOfInstallments: 3
      };

      mockPrisma.invoice.findUnique.mockResolvedValue(mockInvoice);

      await expect(installmentService.createInstallmentPlan(
        'inv-123', planData, 'user-123'
      )).rejects.toThrow('Down payment cannot be greater than or equal to total amount');
    });
  });

  describe('calculateInstallmentAmounts', () => {
    it('should calculate equal installment amounts', () => {
      const remainingAmount = 6000.00;
      const numberOfInstallments = 6;

      const result = installmentService.calculateInstallmentAmounts(
        remainingAmount, numberOfInstallments
      );

      expect(result).toHaveLength(6);
      result.forEach(amount => {
        expect(amount).toBe(1000.00);
      });
    });

    it('should handle remainder in last installment', () => {
      const remainingAmount = 1000.00;
      const numberOfInstallments = 3;

      const result = installmentService.calculateInstallmentAmounts(
        remainingAmount, numberOfInstallments
      );

      expect(result).toHaveLength(3);
      expect(result[0]).toBe(333.33);
      expect(result[1]).toBe(333.33);
      expect(result[2]).toBe(333.34); // Last installment gets the remainder
    });

    it('should handle single installment', () => {
      const remainingAmount = 1500.00;
      const numberOfInstallments = 1;

      const result = installmentService.calculateInstallmentAmounts(
        remainingAmount, numberOfInstallments
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(1500.00);
    });
  });

  describe('calculateDueDates', () => {
    it('should calculate monthly due dates correctly', () => {
      const startDate = new Date('2023-01-15');
      const numberOfInstallments = 3;
      const intervalType = 'Monthly';

      const result = installmentService.calculateDueDates(
        startDate, numberOfInstallments, intervalType
      );

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual(new Date('2023-02-15'));
      expect(result[1]).toEqual(new Date('2023-03-15'));
      expect(result[2]).toEqual(new Date('2023-04-15'));
    });

    it('should calculate weekly due dates correctly', () => {
      const startDate = new Date('2023-01-01'); // Sunday
      const numberOfInstallments = 3;
      const intervalType = 'Weekly';

      const result = installmentService.calculateDueDates(
        startDate, numberOfInstallments, intervalType
      );

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual(new Date('2023-01-08'));
      expect(result[1]).toEqual(new Date('2023-01-15'));
      expect(result[2]).toEqual(new Date('2023-01-22'));
    });

    it('should calculate quarterly due dates correctly', () => {
      const startDate = new Date('2023-01-01');
      const numberOfInstallments = 2;
      const intervalType = 'Quarterly';

      const result = installmentService.calculateDueDates(
        startDate, numberOfInstallments, intervalType
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(new Date('2023-04-01'));
      expect(result[1]).toEqual(new Date('2023-07-01'));
    });

    it('should default to monthly for invalid interval type', () => {
      const startDate = new Date('2023-01-01');
      const numberOfInstallments = 2;
      const intervalType = 'InvalidType';

      const result = installmentService.calculateDueDates(
        startDate, numberOfInstallments, intervalType
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(new Date('2023-02-01'));
      expect(result[1]).toEqual(new Date('2023-03-01'));
    });
  });

  describe('recordInstallmentPayment', () => {
    it('should record payment for pending installment', async () => {
      const installmentId = 'inst-123';
      const paymentData = {
        amount: 500.00,
        method: 'Cash',
        reference: 'REF-001',
        recordedById: 'user-123'
      };

      const mockInstallment = {
        id: installmentId,
        amount: 500.00,
        paidAmount: 0,
        status: 'Pending',
        plan: {
          invoice: {
            customerId: 'cust-123'
          }
        }
      };

      const updatedInstallment = {
        ...mockInstallment,
        paidAmount: 500.00,
        status: 'Paid',
        paidDate: expect.any(Date)
      };

      mockPrisma.installment.findUnique.mockResolvedValue(mockInstallment);
      mockPrisma.$transaction.mockResolvedValue({
        installment: updatedInstallment,
        payment: {
          id: 'pay-123',
          amount: 500.00,
          installmentId
        }
      });

      const result = await installmentService.recordInstallmentPayment(
        installmentId, paymentData
      );

      expect(mockPrisma.installment.findUnique).toHaveBeenCalledWith({
        where: { id: installmentId },
        include: {
          plan: {
            include: {
              invoice: true
            }
          }
        }
      });
      expect(result.installment.status).toBe('Paid');
      expect(result.payment.amount).toBe(500.00);
    });

    it('should record partial payment', async () => {
      const installmentId = 'inst-123';
      const paymentData = {
        amount: 300.00,
        method: 'Cash',
        recordedById: 'user-123'
      };

      const mockInstallment = {
        id: installmentId,
        amount: 500.00,
        paidAmount: 0,
        status: 'Pending'
      };

      const updatedInstallment = {
        ...mockInstallment,
        paidAmount: 300.00,
        status: 'Partial'
      };

      mockPrisma.installment.findUnique.mockResolvedValue(mockInstallment);
      mockPrisma.$transaction.mockResolvedValue({
        installment: updatedInstallment,
        payment: { amount: 300.00 }
      });

      const result = await installmentService.recordInstallmentPayment(
        installmentId, paymentData
      );

      expect(result.installment.status).toBe('Partial');
      expect(result.installment.paidAmount).toBe(300.00);
    });

    it('should throw error for overpayment', async () => {
      const installmentId = 'inst-123';
      const paymentData = {
        amount: 600.00,
        method: 'Cash',
        recordedById: 'user-123'
      };

      const mockInstallment = {
        id: installmentId,
        amount: 500.00,
        paidAmount: 100.00,
        status: 'Partial'
      };

      mockPrisma.installment.findUnique.mockResolvedValue(mockInstallment);

      await expect(installmentService.recordInstallmentPayment(
        installmentId, paymentData
      )).rejects.toThrow('Payment amount exceeds remaining installment balance');

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('should throw error for already paid installment', async () => {
      const installmentId = 'inst-123';
      const paymentData = {
        amount: 100.00,
        method: 'Cash',
        recordedById: 'user-123'
      };

      const mockInstallment = {
        id: installmentId,
        amount: 500.00,
        paidAmount: 500.00,
        status: 'Paid'
      };

      mockPrisma.installment.findUnique.mockResolvedValue(mockInstallment);

      await expect(installmentService.recordInstallmentPayment(
        installmentId, paymentData
      )).rejects.toThrow('Installment is already fully paid');

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('getOverdueInstallments', () => {
    it('should return overdue installments', async () => {
      const currentDate = new Date('2023-08-15');
      const mockOverdueInstallments = [
        {
          id: 'inst-1',
          installmentNumber: 1,
          dueDate: new Date('2023-08-01'),
          amount: 500.00,
          paidAmount: 0,
          status: 'Pending',
          plan: {
            invoice: {
              invoiceNumber: 'INV-001',
              customer: {
                name: 'John Doe',
                phone: '1234567890'
              }
            }
          }
        },
        {
          id: 'inst-2',
          installmentNumber: 2,
          dueDate: new Date('2023-08-10'),
          amount: 500.00,
          paidAmount: 200.00,
          status: 'Partial',
          plan: {
            invoice: {
              invoiceNumber: 'INV-002',
              customer: {
                name: 'Jane Smith',
                phone: '0987654321'
              }
            }
          }
        }
      ];

      mockPrisma.installment.findMany.mockResolvedValue(mockOverdueInstallments);

      const result = await installmentService.getOverdueInstallments(currentDate);

      expect(mockPrisma.installment.findMany).toHaveBeenCalledWith({
        where: {
          dueDate: { lt: currentDate },
          status: { in: ['Pending', 'Partial'] }
        },
        include: {
          plan: {
            include: {
              invoice: {
                include: {
                  customer: {
                    select: {
                      name: true,
                      phone: true,
                      email: true
                    }
                  }
                }
              }
            }
          }
        },
        orderBy: { dueDate: 'asc' }
      });
      expect(result).toEqual(mockOverdueInstallments);
    });
  });

  describe('calculateLateCharges', () => {
    it('should calculate late charges correctly', () => {
      const installmentAmount = 1000.00;
      const dueDate = new Date('2023-08-01');
      const currentDate = new Date('2023-08-15');
      const lateChargeRate = 2.0; // 2% per month

      const result = installmentService.calculateLateCharges(
        installmentAmount, dueDate, currentDate, lateChargeRate
      );

      // 14 days late = approximately 0.47 months
      // Expected: 1000 * 0.02 * 0.47 = approximately 9.33
      expect(result).toBeCloseTo(9.33, 2);
    });

    it('should return zero for non-overdue installments', () => {
      const installmentAmount = 1000.00;
      const dueDate = new Date('2023-08-15');
      const currentDate = new Date('2023-08-10');
      const lateChargeRate = 2.0;

      const result = installmentService.calculateLateCharges(
        installmentAmount, dueDate, currentDate, lateChargeRate
      );

      expect(result).toBe(0);
    });

    it('should handle zero late charge rate', () => {
      const installmentAmount = 1000.00;
      const dueDate = new Date('2023-08-01');
      const currentDate = new Date('2023-08-15');
      const lateChargeRate = 0;

      const result = installmentService.calculateLateCharges(
        installmentAmount, dueDate, currentDate, lateChargeRate
      );

      expect(result).toBe(0);
    });
  });

  describe('getInstallmentPlanSummary', () => {
    it('should return plan summary with payment status', async () => {
      const planId = 'plan-123';
      const mockPlan = {
        id: planId,
        totalAmount: 10000.00,
        downPayment: 2000.00,
        numberOfInstallments: 4,
        installments: [
          {
            id: 'inst-1',
            amount: 2000.00,
            paidAmount: 2000.00,
            status: 'Paid'
          },
          {
            id: 'inst-2',
            amount: 2000.00,
            paidAmount: 1000.00,
            status: 'Partial'
          },
          {
            id: 'inst-3',
            amount: 2000.00,
            paidAmount: 0,
            status: 'Pending'
          },
          {
            id: 'inst-4',
            amount: 2000.00,
            paidAmount: 0,
            status: 'Pending'
          }
        ]
      };

      mockPrisma.installmentPlan.findUnique.mockResolvedValue(mockPlan);

      const result = await installmentService.getInstallmentPlanSummary(planId);

      expect(mockPrisma.installmentPlan.findUnique).toHaveBeenCalledWith({
        where: { id: planId },
        include: {
          installments: {
            orderBy: { installmentNumber: 'asc' }
          },
          invoice: {
            include: {
              customer: true
            }
          }
        }
      });

      expect(result.summary.totalPaid).toBe(3000.00); // 2000 + 1000
      expect(result.summary.remainingAmount).toBe(5000.00); // 8000 - 3000
      expect(result.summary.paidInstallments).toBe(1);
      expect(result.summary.partialInstallments).toBe(1);
      expect(result.summary.pendingInstallments).toBe(2);
    });
  });
});