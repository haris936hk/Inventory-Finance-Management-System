/**
 * Fix Vendor Balances Script
 *
 * Recalculates all vendor currentBalance fields based on:
 * - Opening Balance
 * - Bills (increase balance - what we owe)
 * - Payments (decrease balance - what we've paid)
 *
 * This fixes any corruption from previous logic that incorrectly included Purchase Orders
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixVendorBalances() {
  console.log('🔧 Starting vendor balance recalculation...\n');

  try {
    // Get all vendors
    const vendors = await prisma.vendor.findMany({
      where: { deletedAt: null },
      include: {
        bills: {
          where: {
            deletedAt: null,
            cancelledAt: null
          }
        },
        payments: {
          where: {
            deletedAt: null,
            voidedAt: null
          }
        }
      }
    });

    console.log(`Found ${vendors.length} vendors to process\n`);

    let updatedCount = 0;
    let errorCount = 0;

    for (const vendor of vendors) {
      try {
        // Calculate correct balance
        let correctBalance = parseFloat(vendor.openingBalance) || 0;

        // Add all non-cancelled bills
        for (const bill of vendor.bills) {
          correctBalance += parseFloat(bill.total);
        }

        // Subtract all non-voided payments
        for (const payment of vendor.payments) {
          correctBalance -= parseFloat(payment.amount);
        }

        const currentBalance = parseFloat(vendor.currentBalance) || 0;
        const difference = correctBalance - currentBalance;

        // Only update if there's a difference
        if (Math.abs(difference) > 0.01) {
          await prisma.vendor.update({
            where: { id: vendor.id },
            data: { currentBalance: correctBalance }
          });

          console.log(`✅ ${vendor.name} (${vendor.code})`);
          console.log(`   Old Balance: PKR ${currentBalance.toFixed(2)}`);
          console.log(`   New Balance: PKR ${correctBalance.toFixed(2)}`);
          console.log(`   Difference:  PKR ${difference.toFixed(2)}`);
          console.log(`   Bills: ${vendor.bills.length}, Payments: ${vendor.payments.length}\n`);

          updatedCount++;
        } else {
          console.log(`✓ ${vendor.name} (${vendor.code}) - Balance correct (PKR ${correctBalance.toFixed(2)})`);
        }
      } catch (error) {
        console.error(`❌ Error processing vendor ${vendor.name}:`, error.message);
        errorCount++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Summary:');
    console.log(`   Total Vendors:    ${vendors.length}`);
    console.log(`   Updated:          ${updatedCount}`);
    console.log(`   Already Correct:  ${vendors.length - updatedCount - errorCount}`);
    console.log(`   Errors:           ${errorCount}`);
    console.log('='.repeat(60));

    console.log('\n✨ Vendor balance recalculation completed!\n');
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
fixVendorBalances()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
