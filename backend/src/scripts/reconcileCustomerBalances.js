/**
 * Customer Balance Reconciliation Script
 *
 * This script reconciles customer.currentBalance with the computed ledger balance.
 *
 * WHY THIS IS NEEDED:
 * - The computed ledger excludes cancelled invoices and voided payments
 * - The customer.currentBalance field may include these if not properly reversed
 * - This script detects and fixes discrepancies
 *
 * WHAT IT DOES:
 * 1. Computes correct balance from invoices/payments (excluding cancelled/voided)
 * 2. Compares with customer.currentBalance
 * 3. Creates adjustment ledger entries for discrepancies
 * 4. Updates customer.currentBalance to match computed balance
 *
 * USAGE:
 *   node src/scripts/reconcileCustomerBalances.js [--dry-run] [--customer-id=xxx]
 *
 * OPTIONS:
 *   --dry-run         Show what would be fixed without making changes
 *   --customer-id=xxx Only reconcile specific customer
 */

const { PrismaClient } = require('@prisma/client');
const { formatAmount } = require('../utils/transactionWrapper');

const prisma = new PrismaClient();

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const customerIdArg = args.find(arg => arg.startsWith('--customer-id='));
const specificCustomerId = customerIdArg ? customerIdArg.split('=')[1] : null;

/**
 * Compute correct customer balance from ledger
 * (Mirrors logic from ledgerService.getCustomerLedger)
 */
async function computeCustomerBalance(customerId) {
  // Get customer opening balance
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { openingBalance: true, currentBalance: true, name: true, phone: true }
  });

  if (!customer) {
    throw new Error(`Customer ${customerId} not found`);
  }

  // Start with opening balance
  let balance = formatAmount(customer.openingBalance || 0);

  // Get all non-cancelled invoices
  const invoices = await prisma.invoice.findMany({
    where: {
      customerId,
      deletedAt: null,
      cancelledAt: null  // Exclude cancelled invoices
    },
    select: { total: true, invoiceNumber: true },
    orderBy: { createdAt: 'asc' }
  });

  // Add invoice totals (debits - customer owes us)
  for (const invoice of invoices) {
    balance += formatAmount(invoice.total);
  }

  // Get all non-voided payments
  const payments = await prisma.payment.findMany({
    where: {
      customerId,
      deletedAt: null,
      voidedAt: null  // Exclude voided payments
    },
    select: { amount: true, paymentNumber: true },
    orderBy: { paymentDate: 'asc' }
  });

  // Subtract payment amounts (credits - customer pays us)
  for (const payment of payments) {
    balance -= formatAmount(payment.amount);
  }

  return {
    computedBalance: balance,
    storedBalance: formatAmount(customer.currentBalance || 0),
    customer
  };
}

/**
 * Reconcile a single customer
 */
async function reconcileCustomer(customerId, isDryRun = false) {
  const { computedBalance, storedBalance, customer } = await computeCustomerBalance(customerId);
  const difference = formatAmount(storedBalance - computedBalance);

  // Check if reconciliation needed (allowing 0.01 tolerance for floating point errors)
  if (Math.abs(difference) <= 0.01) {
    console.log(`✓ Customer ${customer.name} (${customer.phone}): Balance OK (${storedBalance})`);
    return { reconciled: false, difference: 0 };
  }

  // Reconciliation needed
  console.log(`✗ Customer ${customer.name} (${customer.phone}):`);
  console.log(`  Stored Balance:   PKR ${storedBalance.toFixed(2)}`);
  console.log(`  Computed Balance: PKR ${computedBalance.toFixed(2)}`);
  console.log(`  Difference:       PKR ${Math.abs(difference).toFixed(2)}`);
  if (difference > 0) {
    console.log(`  Issue:            Stored balance is TOO HIGH (possibly includes cancelled invoices/voided payments)`);
  } else {
    console.log(`  Issue:            Stored balance is TOO LOW (possibly missing invoice/payment ledger entries)`);
  }

  if (isDryRun) {
    console.log(`  [DRY RUN] Would create adjustment ledger entry and update balance\n`);
    return { reconciled: true, difference: Math.abs(difference) };
  }

  // Create adjustment in a transaction
  await prisma.$transaction(async (tx) => {
    // Create ledger adjustment entry
    await tx.customerLedger.create({
      data: {
        customerId,
        entryDate: new Date(),
        description: `Balance reconciliation adjustment (stored: ${storedBalance}, computed: ${computedBalance})`,
        debit: difference < 0 ? Math.abs(difference) : 0,   // If understated, add debit
        credit: difference > 0 ? difference : 0,             // If overstated, add credit
        balance: computedBalance,
        invoiceId: null
      }
    });

    // Update customer balance
    await tx.customer.update({
      where: { id: customerId },
      data: { currentBalance: computedBalance }
    });

    console.log(`  ✓ Created adjustment entry and updated balance\n`);
  });

  return { reconciled: true, difference };
}

/**
 * Main reconciliation function
 */
async function main() {
  console.log('='.repeat(80));
  console.log('Customer Balance Reconciliation');
  console.log('='.repeat(80));
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (changes will be committed)'}`);
  if (specificCustomerId) {
    console.log(`Target: Single customer (ID: ${specificCustomerId})`);
  } else {
    console.log(`Target: All customers`);
  }
  console.log('='.repeat(80));
  console.log('');

  try {
    // Get customers to reconcile
    const where = { deletedAt: null };
    if (specificCustomerId) {
      where.id = specificCustomerId;
    }

    const customers = await prisma.customer.findMany({
      where,
      select: { id: true, name: true, phone: true }
    });

    console.log(`Found ${customers.length} customer(s) to reconcile\n`);

    // Reconcile each customer
    let reconciledCount = 0;
    let totalDifference = 0;

    for (const customer of customers) {
      try {
        const result = await reconcileCustomer(customer.id, isDryRun);
        if (result.reconciled) {
          reconciledCount++;
          totalDifference += Math.abs(result.difference);
        }
      } catch (error) {
        console.error(`✗ Error reconciling customer ${customer.name}: ${error.message}\n`);
      }
    }

    // Summary
    console.log('='.repeat(80));
    console.log('Summary');
    console.log('='.repeat(80));
    console.log(`Total customers checked: ${customers.length}`);
    console.log(`Customers needing reconciliation: ${reconciledCount}`);
    console.log(`Total absolute difference: PKR ${totalDifference.toFixed(2)}`);
    if (isDryRun) {
      console.log(`\nRun without --dry-run to apply changes`);
    } else if (reconciledCount > 0) {
      console.log(`\n✓ Reconciliation complete. ${reconciledCount} customer(s) adjusted.`);
    } else {
      console.log(`\n✓ All customer balances are correct. No adjustments needed.`);
    }

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
main();
