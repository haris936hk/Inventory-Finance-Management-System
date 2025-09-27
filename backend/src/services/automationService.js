const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class AutomationService {

  // ===================== PURCHASE AUTO-UPDATE INVENTORY =====================

  /**
   * Auto-update inventory when purchase order is received/completed
   * This is triggered when PO status changes to 'Completed'
   */
  async handlePurchaseOrderCompletion(purchaseOrderId, userId) {
    try {
      const log = await this.createAutomationLog(
        'PURCHASE_INVENTORY_UPDATE',
        'PurchaseOrder',
        purchaseOrderId,
        'Processing purchase order completion for inventory update'
      );

      // Get the purchase order with items
      const purchaseOrder = await prisma.purchaseOrder.findUnique({
        where: { id: purchaseOrderId },
        include: {
          vendor: true,
          items: {
            include: {
              model: {
                include: {
                  category: true,
                  company: true
                }
              }
            }
          }
        }
      });

      if (!purchaseOrder) {
        throw new Error('Purchase order not found');
      }

      const affectedRecords = [];

      // Process each item in the purchase order
      for (const item of purchaseOrder.items) {
        // Update item status to 'In Store'
        const updatedItem = await prisma.item.update({
          where: { id: item.id },
          data: {
            status: 'In Store',
            receivedDate: new Date(),
            updatedAt: new Date()
          }
        });

        affectedRecords.push({
          model: 'Item',
          id: item.id,
          action: 'status_updated_to_in_store',
          serialNumber: item.serialNumber
        });

        // Create inventory movement record
        await prisma.inventoryMovement.create({
          data: {
            itemId: item.id,
            movementType: 'PURCHASE_RECEIPT',
            fromStatus: item.status,
            toStatus: 'In Store',
            reference: `PO-${purchaseOrder.poNumber}`,
            notes: `Auto-updated from purchase order completion`,
            userId: userId
          }
        });

        affectedRecords.push({
          model: 'InventoryMovement',
          action: 'created_purchase_receipt',
          reference: `PO-${purchaseOrder.poNumber}`
        });
      }

      // Create journal entries for accounting
      await this.createPurchaseJournalEntries(purchaseOrder, userId);

      affectedRecords.push({
        model: 'JournalEntry',
        action: 'created_purchase_accounting_entries',
        reference: `PO-${purchaseOrder.poNumber}`
      });

      // Update automation log with success
      await this.updateAutomationLog(log.id, 'Success', null, affectedRecords);

      return {
        success: true,
        message: `Successfully processed ${purchaseOrder.items.length} items from PO ${purchaseOrder.poNumber}`,
        affectedItems: purchaseOrder.items.length,
        affectedRecords
      };

    } catch (error) {
      // Update automation log with error
      if (log) {
        await this.updateAutomationLog(log.id, 'Failed', error.message, []);
      }
      throw new Error(`Purchase automation failed: ${error.message}`);
    }
  }

  /**
   * Auto-create bill from purchase order
   */
  async createBillFromPurchaseOrder(purchaseOrderId, billDetails, userId) {
    try {
      const log = await this.createAutomationLog(
        'PURCHASE_BILL_CREATION',
        'PurchaseOrder',
        purchaseOrderId,
        'Creating bill from purchase order'
      );

      const purchaseOrder = await prisma.purchaseOrder.findUnique({
        where: { id: purchaseOrderId },
        include: { vendor: true, items: true }
      });

      if (!purchaseOrder) {
        throw new Error('Purchase order not found');
      }

      // Create the bill
      const bill = await prisma.bill.create({
        data: {
          billNumber: billDetails.billNumber || `BILL-${Date.now()}`,
          billDate: billDetails.billDate || new Date(),
          dueDate: billDetails.dueDate,
          vendorId: purchaseOrder.vendorId,
          purchaseOrderId: purchaseOrderId,
          subtotal: purchaseOrder.subtotal,
          taxAmount: purchaseOrder.taxAmount,
          total: purchaseOrder.total,
          status: 'Unpaid'
        }
      });

      // Get vendor's current balance for ledger calculation
      const vendor = await prisma.vendor.findUnique({
        where: { id: purchaseOrder.vendorId }
      });

      const billAmount = parseFloat(purchaseOrder.total);
      const newBalance = parseFloat(vendor.currentBalance) + billAmount;

      // Update vendor balance
      await prisma.vendor.update({
        where: { id: purchaseOrder.vendorId },
        data: {
          currentBalance: newBalance
        }
      });

      // Create vendor ledger entry with calculated balance
      await prisma.vendorLedger.create({
        data: {
          vendorId: purchaseOrder.vendorId,
          billId: bill.id,
          entryDate: new Date(),
          description: `Bill ${bill.billNumber} - ${purchaseOrder.poNumber}`,
          debit: billAmount,
          credit: 0,
          balance: newBalance
        }
      });

      const affectedRecords = [
        { model: 'Bill', id: bill.id, action: 'created' },
        { model: 'Vendor', id: purchaseOrder.vendorId, action: 'balance_updated' },
        { model: 'VendorLedger', action: 'entry_created' }
      ];

      await this.updateAutomationLog(log.id, 'Success', null, affectedRecords);

      return {
        success: true,
        bill,
        message: `Bill ${bill.billNumber} created from PO ${purchaseOrder.poNumber}`
      };

    } catch (error) {
      if (log) {
        await this.updateAutomationLog(log.id, 'Failed', error.message, []);
      }
      throw error;
    }
  }

  // ===================== SUPPLIER INVOICE AUTO-UPDATE EXPENSES =====================

  /**
   * Auto-update expenses when supplier invoice (bill) is created/updated
   */
  async handleSupplierInvoiceExpenseUpdate(billId, userId) {
    try {
      const log = await this.createAutomationLog(
        'BILL_EXPENSE_UPDATE',
        'Bill',
        billId,
        'Processing supplier invoice for expense updates'
      );

      const bill = await prisma.bill.findUnique({
        where: { id: billId },
        include: {
          vendor: true,
          purchaseOrder: {
            include: {
              items: {
                include: {
                  model: {
                    include: { category: true }
                  }
                }
              }
            }
          }
        }
      });

      if (!bill) {
        throw new Error('Bill not found');
      }

      const affectedRecords = [];

      // Create journal entries for the expense
      const expenseAccountId = await this.getExpenseAccountId(bill);
      const payableAccountId = await this.getAccountsPayableAccountId();

      // Expense journal entries
      const expenseEntry = await prisma.journalEntry.create({
        data: {
          entryDate: bill.billDate,
          reference: bill.billNumber,
          description: `Expense - ${bill.vendor.name} - ${bill.billNumber}`,
          accountId: expenseAccountId,
          debit: bill.total,
          credit: 0,
          sourceType: 'Bill',
          sourceId: billId
        }
      });

      const payableEntry = await prisma.journalEntry.create({
        data: {
          entryDate: bill.billDate,
          reference: bill.billNumber,
          description: `Accounts Payable - ${bill.vendor.name} - ${bill.billNumber}`,
          accountId: payableAccountId,
          debit: 0,
          credit: bill.total,
          sourceType: 'Bill',
          sourceId: billId
        }
      });

      affectedRecords.push(
        { model: 'JournalEntry', id: expenseEntry.id, action: 'expense_entry_created' },
        { model: 'JournalEntry', id: payableEntry.id, action: 'payable_entry_created' }
      );

      // Update account balances
      await this.updateAccountBalance(expenseAccountId, bill.total, 'debit');
      await this.updateAccountBalance(payableAccountId, bill.total, 'credit');

      affectedRecords.push(
        { model: 'Account', id: expenseAccountId, action: 'balance_updated' },
        { model: 'Account', id: payableAccountId, action: 'balance_updated' }
      );

      // If there are specific items, categorize expenses
      if (bill.purchaseOrder?.items) {
        await this.categorizeItemExpenses(bill, affectedRecords);
      }

      await this.updateAutomationLog(log.id, 'Success', null, affectedRecords);

      return {
        success: true,
        message: `Expenses updated for bill ${bill.billNumber}`,
        expenseAmount: parseFloat(bill.total),
        affectedRecords
      };

    } catch (error) {
      if (log) {
        await this.updateAutomationLog(log.id, 'Failed', error.message, []);
      }
      throw new Error(`Expense automation failed: ${error.message}`);
    }
  }

  // ===================== INVOICE SALES AUTOMATION =====================

  /**
   * Auto-update inventory when invoice is paid (items sold)
   */
  async handleInvoicePaymentInventoryUpdate(invoiceId, userId) {
    try {
      const log = await this.createAutomationLog(
        'INVOICE_INVENTORY_UPDATE',
        'Invoice',
        invoiceId,
        'Processing invoice payment for inventory update'
      );

      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          customer: true,
          items: {
            include: {
              item: true
            }
          }
        }
      });

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      const affectedRecords = [];

      // Update each sold item status to 'Sold'
      for (const invoiceItem of invoice.items) {
        await prisma.item.update({
          where: { id: invoiceItem.itemId },
          data: {
            status: 'Sold',
            soldDate: new Date(),
            updatedAt: new Date()
          }
        });

        // Create inventory movement record
        await prisma.inventoryMovement.create({
          data: {
            itemId: invoiceItem.itemId,
            movementType: 'SALE',
            fromStatus: invoiceItem.item.status,
            toStatus: 'Sold',
            reference: `INV-${invoice.invoiceNumber}`,
            notes: `Auto-updated from invoice payment`,
            userId: userId
          }
        });

        affectedRecords.push({
          model: 'Item',
          id: invoiceItem.itemId,
          action: 'status_updated_to_sold',
          serialNumber: invoiceItem.item.serialNumber
        });
      }

      // Create sales journal entries
      await this.createSalesJournalEntries(invoice, userId);

      affectedRecords.push({
        model: 'JournalEntry',
        action: 'created_sales_accounting_entries',
        reference: `INV-${invoice.invoiceNumber}`
      });

      await this.updateAutomationLog(log.id, 'Success', null, affectedRecords);

      return {
        success: true,
        message: `Successfully processed ${invoice.items.length} sold items from invoice ${invoice.invoiceNumber}`,
        affectedItems: invoice.items.length,
        affectedRecords
      };

    } catch (error) {
      if (log) {
        await this.updateAutomationLog(log.id, 'Failed', error.message, []);
      }
      throw error;
    }
  }

  // ===================== HELPER METHODS =====================

  async createAutomationLog(action, sourceType, sourceId, description) {
    return await prisma.automationLog.create({
      data: {
        action,
        sourceType,
        sourceId,
        description,
        status: 'In Progress',
        affectedRecords: []
      }
    });
  }

  async updateAutomationLog(logId, status, errorMessage, affectedRecords) {
    return await prisma.automationLog.update({
      where: { id: logId },
      data: {
        status,
        errorMessage,
        affectedRecords,
        executedAt: new Date()
      }
    });
  }

  async createPurchaseJournalEntries(purchaseOrder, userId) {
    // Debit: Inventory (Asset)
    // Credit: Accounts Payable (Liability)

    const inventoryAccountId = await this.getInventoryAccountId();
    const payableAccountId = await this.getAccountsPayableAccountId();

    await prisma.journalEntry.createMany({
      data: [
        {
          entryDate: new Date(),
          reference: purchaseOrder.poNumber,
          description: `Inventory Purchase - ${purchaseOrder.vendor.name}`,
          accountId: inventoryAccountId,
          debit: purchaseOrder.total,
          credit: 0,
          sourceType: 'PurchaseOrder',
          sourceId: purchaseOrder.id
        },
        {
          entryDate: new Date(),
          reference: purchaseOrder.poNumber,
          description: `Accounts Payable - ${purchaseOrder.vendor.name}`,
          accountId: payableAccountId,
          debit: 0,
          credit: purchaseOrder.total,
          sourceType: 'PurchaseOrder',
          sourceId: purchaseOrder.id
        }
      ]
    });
  }

  async createSalesJournalEntries(invoice, userId) {
    // Debit: Accounts Receivable (Asset) or Cash
    // Credit: Sales Revenue (Income)
    // Debit: Cost of Goods Sold (Expense)
    // Credit: Inventory (Asset)

    const receivableAccountId = await this.getAccountsReceivableAccountId();
    const salesAccountId = await this.getSalesAccountId();
    const cogsAccountId = await this.getCOGSAccountId();
    const inventoryAccountId = await this.getInventoryAccountId();

    // Calculate COGS
    const cogs = await this.calculateInvoiceCOGS(invoice);

    await prisma.journalEntry.createMany({
      data: [
        // Sales entry
        {
          entryDate: invoice.invoiceDate,
          reference: invoice.invoiceNumber,
          description: `Sales - ${invoice.customer.name}`,
          accountId: receivableAccountId,
          debit: invoice.total,
          credit: 0,
          sourceType: 'Invoice',
          sourceId: invoice.id
        },
        {
          entryDate: invoice.invoiceDate,
          reference: invoice.invoiceNumber,
          description: `Sales Revenue - ${invoice.customer.name}`,
          accountId: salesAccountId,
          debit: 0,
          credit: invoice.total,
          sourceType: 'Invoice',
          sourceId: invoice.id
        },
        // COGS entry
        {
          entryDate: invoice.invoiceDate,
          reference: invoice.invoiceNumber,
          description: `COGS - ${invoice.customer.name}`,
          accountId: cogsAccountId,
          debit: cogs,
          credit: 0,
          sourceType: 'Invoice',
          sourceId: invoice.id
        },
        {
          entryDate: invoice.invoiceDate,
          reference: invoice.invoiceNumber,
          description: `Inventory Reduction - ${invoice.customer.name}`,
          accountId: inventoryAccountId,
          debit: 0,
          credit: cogs,
          sourceType: 'Invoice',
          sourceId: invoice.id
        }
      ]
    });
  }

  async calculateInvoiceCOGS(invoice) {
    let totalCOGS = 0;
    for (const invoiceItem of invoice.items) {
      const item = await prisma.item.findUnique({
        where: { id: invoiceItem.itemId },
        select: { purchasePrice: true }
      });
      totalCOGS += (item.purchasePrice || 0) * invoiceItem.quantity;
    }
    return totalCOGS;
  }

  // Account ID getters (these should be configured in your chart of accounts)
  async getInventoryAccountId() {
    return 'inventory-account-id'; // Replace with actual account ID lookup
  }

  async getAccountsPayableAccountId() {
    return 'accounts-payable-id'; // Replace with actual account ID lookup
  }

  async getAccountsReceivableAccountId() {
    return 'accounts-receivable-id'; // Replace with actual account ID lookup
  }

  async getSalesAccountId() {
    return 'sales-revenue-id'; // Replace with actual account ID lookup
  }

  async getCOGSAccountId() {
    return 'cogs-account-id'; // Replace with actual account ID lookup
  }

  async getExpenseAccountId(bill) {
    // Categorize based on bill/vendor type
    return 'general-expense-id'; // Replace with actual categorization logic
  }

  async updateAccountBalance(accountId, amount, type) {
    const increment = type === 'debit' ? amount : -amount;
    await prisma.account.update({
      where: { id: accountId },
      data: {
        currentBalance: {
          increment: increment
        }
      }
    });
  }

  async categorizeItemExpenses(bill, affectedRecords) {
    // Implement expense categorization based on items purchased
    // This could categorize expenses by product category, vendor type, etc.
  }
}

// Add inventory movement model to schema if not exists
// This should be added to prisma schema:
/*
model InventoryMovement {
  id            String    @id @default(uuid())
  itemId        String
  item          Item      @relation(fields: [itemId], references: [id])
  movementType  String    // "PURCHASE_RECEIPT", "SALE", "ADJUSTMENT", "TRANSFER"
  fromStatus    String?
  toStatus      String
  quantity      Int       @default(1)
  reference     String?   // PO number, Invoice number, etc.
  notes         String?

  userId        String
  user          User      @relation(fields: [userId], references: [id])

  createdAt     DateTime  @default(now())

  @@index([itemId])
  @@index([movementType])
  @@index([createdAt])
}
*/

module.exports = new AutomationService();