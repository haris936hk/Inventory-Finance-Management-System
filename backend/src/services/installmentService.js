const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class InstallmentService {

  // ===================== INSTALLMENT PLAN CREATION =====================

  /**
   * Create installment plan for an invoice
   */
  async createInstallmentPlan(invoiceId, planData, userId) {
    try {
      const {
        downPayment = 0,
        numberOfInstallments,
        intervalType = 'Monthly',
        startDate,
        notes
      } = planData;

      // Get the invoice
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: { customer: true }
      });

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      if (invoice.hasInstallment) {
        throw new Error('Invoice already has an installment plan');
      }

      const totalAmount = parseFloat(invoice.total);
      const downPaymentAmount = parseFloat(downPayment);
      const remainingAmount = totalAmount - downPaymentAmount;

      if (remainingAmount <= 0) {
        throw new Error('Down payment cannot be greater than or equal to total amount');
      }

      if (numberOfInstallments < 1) {
        throw new Error('Number of installments must be at least 1');
      }

      const installmentAmount = remainingAmount / numberOfInstallments;

      // Create installment plan
      const plan = await prisma.installmentPlan.create({
        data: {
          invoiceId,
          totalAmount,
          downPayment: downPaymentAmount,
          numberOfInstallments,
          intervalType,
          startDate: new Date(startDate)
        }
      });

      // Create individual installments
      const installments = [];
      const planStartDate = new Date(startDate);

      for (let i = 1; i <= numberOfInstallments; i++) {
        const dueDate = this.calculateInstallmentDueDate(planStartDate, i, intervalType);

        // Last installment may have a different amount due to rounding
        const amount = i === numberOfInstallments
          ? remainingAmount - (installmentAmount * (numberOfInstallments - 1))
          : installmentAmount;

        const installment = await prisma.installment.create({
          data: {
            planId: plan.id,
            installmentNumber: i,
            dueDate,
            amount: parseFloat(amount.toFixed(2)),
            status: 'Pending'
          }
        });

        installments.push(installment);
      }

      // Update invoice
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          hasInstallment: true,
          status: downPaymentAmount > 0 ? 'Partial' : 'Sent'
        }
      });

      // Record down payment if provided
      if (downPaymentAmount > 0) {
        await this.recordDownPayment(invoiceId, downPaymentAmount, userId);
      }

      return {
        plan: {
          ...plan,
          installments
        },
        summary: {
          totalAmount,
          downPayment: downPaymentAmount,
          remainingAmount,
          installmentAmount: parseFloat(installmentAmount.toFixed(2)),
          numberOfInstallments
        }
      };

    } catch (error) {
      throw new Error(`Failed to create installment plan: ${error.message}`);
    }
  }

  /**
   * Record down payment for installment plan
   */
  async recordDownPayment(invoiceId, amount, userId) {
    const paymentNumber = `PAY-${Date.now()}`;

    return await prisma.payment.create({
      data: {
        paymentNumber,
        paymentDate: new Date(),
        amount,
        method: 'Down Payment',
        reference: `Down payment for installment plan`,
        customerId: (await prisma.invoice.findUnique({
          where: { id: invoiceId },
          select: { customerId: true }
        })).customerId,
        invoiceId,
        recordedById: userId
      }
    });
  }

  // ===================== INSTALLMENT PAYMENT PROCESSING =====================

  /**
   * Record payment for a specific installment
   */
  async recordInstallmentPayment(installmentId, paymentData, userId) {
    try {
      const { amount, method, reference, paymentDate = new Date(), notes } = paymentData;

      const installment = await prisma.installment.findUnique({
        where: { id: installmentId },
        include: {
          plan: {
            include: {
              invoice: {
                include: { customer: true }
              }
            }
          }
        }
      });

      if (!installment) {
        throw new Error('Installment not found');
      }

      const remainingAmount = parseFloat(installment.amount) - parseFloat(installment.paidAmount);
      const paymentAmount = parseFloat(amount);

      if (paymentAmount > remainingAmount) {
        throw new Error(`Payment amount (${paymentAmount}) exceeds remaining balance (${remainingAmount})`);
      }

      // Create payment record
      const paymentNumber = `PAY-${Date.now()}`;
      const payment = await prisma.payment.create({
        data: {
          paymentNumber,
          paymentDate: new Date(paymentDate),
          amount: paymentAmount,
          method,
          reference,
          notes,
          customerId: installment.plan.invoice.customerId,
          invoiceId: installment.plan.invoiceId,
          installmentId,
          recordedById: userId
        }
      });

      // Update installment
      const newPaidAmount = parseFloat(installment.paidAmount) + paymentAmount;
      const newStatus = newPaidAmount >= parseFloat(installment.amount) ? 'Paid' : 'Partial';

      await prisma.installment.update({
        where: { id: installmentId },
        data: {
          paidAmount: newPaidAmount,
          status: newStatus,
          paidDate: newStatus === 'Paid' ? new Date(paymentDate) : installment.paidDate
        }
      });

      // Update invoice payment status
      await this.updateInvoicePaymentStatus(installment.plan.invoiceId);

      // Update customer balance
      await this.updateCustomerBalance(installment.plan.invoice.customerId, -paymentAmount);

      // Check for late charges if payment is overdue
      await this.checkAndApplyLateCharges(installmentId);

      return {
        payment,
        installment: {
          ...installment,
          paidAmount: newPaidAmount,
          status: newStatus,
          remainingAmount: parseFloat(installment.amount) - newPaidAmount
        }
      };

    } catch (error) {
      throw new Error(`Failed to record installment payment: ${error.message}`);
    }
  }

  /**
   * Update invoice payment status based on installment payments
   */
  async updateInvoicePaymentStatus(invoiceId) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        installmentPlan: {
          include: {
            installments: true
          }
        },
        payments: true
      }
    });

    if (!invoice.installmentPlan) return;

    // Calculate total paid amount from all sources
    const directPayments = invoice.payments
      .filter(p => !p.installmentId)
      .reduce((sum, p) => sum + parseFloat(p.amount), 0);

    const installmentPayments = invoice.installmentPlan.installments
      .reduce((sum, i) => sum + parseFloat(i.paidAmount), 0);

    const totalPaid = directPayments + installmentPayments;
    const totalAmount = parseFloat(invoice.total);

    let status;
    if (totalPaid >= totalAmount) {
      status = 'Paid';
    } else if (totalPaid > 0) {
      status = 'Partial';
    } else {
      status = 'Sent';
    }

    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        paidAmount: totalPaid,
        status
      }
    });
  }

  // ===================== LATE CHARGES AND PENALTIES =====================

  /**
   * Check and apply late charges for overdue installments
   */
  async checkAndApplyLateCharges(installmentId) {
    const installment = await prisma.installment.findUnique({
      where: { id: installmentId },
      include: {
        plan: {
          include: {
            invoice: {
              include: { customer: true }
            }
          }
        }
      }
    });

    if (!installment || installment.status === 'Paid') return;

    const today = new Date();
    const dueDate = new Date(installment.dueDate);
    const daysLate = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));

    if (daysLate > 0) {
      // Calculate late charges (e.g., 2% per month late)
      const monthsLate = Math.ceil(daysLate / 30);
      const lateChargeRate = 0.02; // 2% per month
      const lateCharges = parseFloat(installment.amount) * lateChargeRate * monthsLate;

      if (lateCharges > parseFloat(installment.lateCharges)) {
        await prisma.installment.update({
          where: { id: installmentId },
          data: {
            lateCharges: parseFloat(lateCharges.toFixed(2)),
            status: 'Overdue'
          }
        });
      }
    }
  }

  /**
   * Get overdue installments for all customers
   */
  async getOverdueInstallments() {
    const today = new Date();

    return await prisma.installment.findMany({
      where: {
        dueDate: { lt: today },
        status: { in: ['Pending', 'Partial'] }
      },
      include: {
        plan: {
          include: {
            invoice: {
              include: { customer: true }
            }
          }
        }
      },
      orderBy: { dueDate: 'asc' }
    });
  }

  // ===================== INSTALLMENT QUERIES =====================

  /**
   * Get installment plan details
   */
  async getInstallmentPlan(planId) {
    return await prisma.installmentPlan.findUnique({
      where: { id: planId },
      include: {
        invoice: {
          include: { customer: true }
        },
        installments: {
          include: {
            payments: true
          },
          orderBy: { installmentNumber: 'asc' }
        }
      }
    });
  }

  /**
   * Get customer installment summary
   */
  async getCustomerInstallmentSummary(customerId) {
    const plans = await prisma.installmentPlan.findMany({
      where: {
        invoice: { customerId }
      },
      include: {
        invoice: true,
        installments: true
      }
    });

    const summary = {
      totalPlans: plans.length,
      totalAmount: 0,
      totalPaid: 0,
      totalOverdue: 0,
      upcomingPayments: [],
      overduePayments: []
    };

    const today = new Date();
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    for (const plan of plans) {
      summary.totalAmount += parseFloat(plan.totalAmount);

      for (const installment of plan.installments) {
        summary.totalPaid += parseFloat(installment.paidAmount);

        if (installment.status !== 'Paid') {
          const remainingAmount = parseFloat(installment.amount) - parseFloat(installment.paidAmount);

          if (new Date(installment.dueDate) < today) {
            summary.totalOverdue += remainingAmount;
            summary.overduePayments.push({
              installmentId: installment.id,
              invoiceNumber: plan.invoice.invoiceNumber,
              dueDate: installment.dueDate,
              amount: remainingAmount,
              installmentNumber: installment.installmentNumber
            });
          } else if (new Date(installment.dueDate) <= nextWeek) {
            summary.upcomingPayments.push({
              installmentId: installment.id,
              invoiceNumber: plan.invoice.invoiceNumber,
              dueDate: installment.dueDate,
              amount: remainingAmount,
              installmentNumber: installment.installmentNumber
            });
          }
        }
      }
    }

    return summary;
  }

  // ===================== HELPER METHODS =====================

  calculateInstallmentDueDate(startDate, installmentNumber, intervalType) {
    const date = new Date(startDate);

    switch (intervalType) {
      case 'Weekly':
        date.setDate(date.getDate() + (installmentNumber * 7));
        break;
      case 'Monthly':
        date.setMonth(date.getMonth() + installmentNumber);
        break;
      case 'Quarterly':
        date.setMonth(date.getMonth() + (installmentNumber * 3));
        break;
      default:
        date.setMonth(date.getMonth() + installmentNumber);
    }

    return date;
  }

  async updateCustomerBalance(customerId, amount) {
    await prisma.customer.update({
      where: { id: customerId },
      data: {
        currentBalance: {
          increment: amount
        }
      }
    });
  }

  // ===================== BATCH OPERATIONS =====================

  /**
   * Process automated late charge calculations (to be run daily)
   */
  async processLateCharges() {
    const overdueInstallments = await this.getOverdueInstallments();
    const results = [];

    for (const installment of overdueInstallments) {
      try {
        await this.checkAndApplyLateCharges(installment.id);
        results.push({
          installmentId: installment.id,
          status: 'Success',
          message: 'Late charges updated'
        });
      } catch (error) {
        results.push({
          installmentId: installment.id,
          status: 'Failed',
          message: error.message
        });
      }
    }

    return {
      processed: overdueInstallments.length,
      results
    };
  }

  /**
   * Generate installment reminders
   */
  async generateInstallmentReminders(daysAhead = 7) {
    const reminderDate = new Date();
    reminderDate.setDate(reminderDate.getDate() + daysAhead);

    const upcomingInstallments = await prisma.installment.findMany({
      where: {
        dueDate: {
          gte: new Date(),
          lte: reminderDate
        },
        status: { in: ['Pending', 'Partial'] }
      },
      include: {
        plan: {
          include: {
            invoice: {
              include: { customer: true }
            }
          }
        }
      },
      orderBy: { dueDate: 'asc' }
    });

    return upcomingInstallments.map(installment => ({
      customerId: installment.plan.invoice.customer.id,
      customerName: installment.plan.invoice.customer.name,
      customerPhone: installment.plan.invoice.customer.phone,
      customerEmail: installment.plan.invoice.customer.email,
      invoiceNumber: installment.plan.invoice.invoiceNumber,
      installmentNumber: installment.installmentNumber,
      dueDate: installment.dueDate,
      amount: parseFloat(installment.amount) - parseFloat(installment.paidAmount),
      daysUntilDue: Math.ceil((new Date(installment.dueDate) - new Date()) / (1000 * 60 * 60 * 24))
    }));
  }
}

module.exports = new InstallmentService();