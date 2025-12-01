/**
 * Data Repair Script: Fix Corrupted Invoice Paid Amounts
 *
 * Issue: Prisma DECIMAL fields returned as strings caused string concatenation
 * instead of numeric addition when recording payments.
 *
 * Example bug: "5000" + 8860 = "50008860" (string concat) instead of 13860 (addition)
 *
 * This script recalculates invoice.paidAmount by summing actual non-voided payments.
 */

const db = require('../config/database');
const logger = require('../config/logger');
const { formatAmount } = require('../utils/transactionWrapper');

async function repairInvoicePaidAmounts() {
  console.log('Starting invoice paid amount repair...\n');

  try {
    await db.connect();

    // Get all invoices with payments
    const invoices = await db.prisma.invoice.findMany({
      where: {
        deletedAt: null,
        cancelledAt: null
      },
      include: {
        payments: {
          where: {
            deletedAt: null,
            voidedAt: null
          }
        }
      }
    });

    console.log(`Found ${invoices.length} invoices to check\n`);

    let fixedCount = 0;
    let checkedCount = 0;
    const fixes = [];

    for (const invoice of invoices) {
      checkedCount++;

      // Calculate correct paid amount from payments
      const correctPaidAmount = invoice.payments.reduce((sum, payment) => {
        return formatAmount(sum + formatAmount(payment.amount));
      }, 0);

      const currentPaidAmount = formatAmount(invoice.paidAmount || 0);

      // Check if there's a mismatch
      if (Math.abs(correctPaidAmount - currentPaidAmount) > 0.01) {
        console.log(`Invoice ${invoice.invoiceNumber}:`);
        console.log(`  Current paidAmount: ${currentPaidAmount}`);
        console.log(`  Correct paidAmount: ${correctPaidAmount}`);
        console.log(`  Difference: ${currentPaidAmount - correctPaidAmount}`);
        console.log(`  Payments: ${invoice.payments.length} payments totaling ${correctPaidAmount}\n`);

        // Update the invoice
        await db.prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            paidAmount: correctPaidAmount
          }
        });

        fixes.push({
          invoiceNumber: invoice.invoiceNumber,
          invoiceId: invoice.id,
          oldAmount: currentPaidAmount,
          newAmount: correctPaidAmount,
          difference: currentPaidAmount - correctPaidAmount
        });

        fixedCount++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`Repair Summary:`);
    console.log(`  Total invoices checked: ${checkedCount}`);
    console.log(`  Invoices fixed: ${fixedCount}`);
    console.log(`  Invoices correct: ${checkedCount - fixedCount}`);
    console.log('='.repeat(60) + '\n');

    if (fixes.length > 0) {
      console.log('Detailed fixes:');
      fixes.forEach(fix => {
        console.log(`  ${fix.invoiceNumber}: ${fix.oldAmount} → ${fix.newAmount} (diff: ${fix.difference})`);
      });
    }

    logger.info(`Invoice paid amount repair completed: ${fixedCount} invoices fixed`);

    await db.disconnect();
    return { fixedCount, checkedCount, fixes };

  } catch (error) {
    console.error('Error during repair:', error);
    logger.error('Invoice repair script failed:', error);
    await db.disconnect();
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  repairInvoicePaidAmounts()
    .then(result => {
      console.log('\n✅ Repair completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Repair failed:', error.message);
      process.exit(1);
    });
}

module.exports = { repairInvoicePaidAmounts };
