const { PrismaClient } = require('@prisma/client');

async function migrateItemCustomerData() {
  const prisma = new PrismaClient();

  try {
    console.log('Starting Item-Customer normalization migration...');

    // Step 1: Get all items with client data
    const itemsWithClientData = await prisma.item.findMany({
      where: {
        OR: [
          { clientName: { not: null } },
          { clientPhone: { not: null } },
          { clientNIC: { not: null } },
          { clientEmail: { not: null } },
          { clientCompany: { not: null } },
          { clientAddress: { not: null } }
        ]
      },
      select: {
        id: true,
        clientName: true,
        clientCompany: true,
        clientNIC: true,
        clientPhone: true,
        clientEmail: true,
        clientAddress: true
      }
    });

    console.log(`Found ${itemsWithClientData.length} items with client data`);

    // Step 2: Create unique customer entries based on phone or NIC (unique identifiers)
    const customerMap = new Map();

    for (const item of itemsWithClientData) {
      // Use phone or NIC as primary identifier, fallback to name
      const uniqueKey = item.clientPhone || item.clientNIC || item.clientName;

      if (uniqueKey && !customerMap.has(uniqueKey)) {
        customerMap.set(uniqueKey, {
          name: item.clientName || 'Unknown Customer',
          company: item.clientCompany,
          email: item.clientEmail,
          phone: item.clientPhone,
          address: item.clientAddress,
          nic: item.clientNIC,
          items: [item.id]
        });
      } else if (uniqueKey) {
        customerMap.get(uniqueKey).items.push(item.id);
      }
    }

    console.log(`Creating ${customerMap.size} unique customers`);

    // Step 3: Create Customer records and link Items
    let createdCustomers = 0;
    let linkedItems = 0;

    for (const [key, customerData] of customerMap) {
      try {
        // Create customer
        const customer = await prisma.customer.create({
          data: {
            name: customerData.name,
            company: customerData.company,
            email: customerData.email,
            phone: customerData.phone,
            address: customerData.address,
            nic: customerData.nic,
            creditLimit: 0,
            openingBalance: 0,
            currentBalance: 0
          }
        });

        createdCustomers++;
        console.log(`Created customer: ${customer.name} (ID: ${customer.id})`);

        // Update all items belonging to this customer
        const updatedItems = await prisma.item.updateMany({
          where: {
            id: { in: customerData.items }
          },
          data: {
            customerId: customer.id
          }
        });

        linkedItems += updatedItems.count;
        console.log(`Linked ${updatedItems.count} items to customer ${customer.name}`);

      } catch (error) {
        console.error(`Error creating customer for key ${key}:`, error.message);
        // Continue with next customer
      }
    }

    console.log('\nMigration Summary:');
    console.log(`- Created customers: ${createdCustomers}`);
    console.log(`- Linked items: ${linkedItems}`);
    console.log('- Migration completed successfully!');

    // Step 4: Verify migration
    const itemsWithCustomers = await prisma.item.count({
      where: {
        customerId: { not: null }
      }
    });

    console.log(`\nVerification: ${itemsWithCustomers} items now have customer relationships`);

  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration if this file is executed directly
if (require.main === module) {
  migrateItemCustomerData()
    .then(() => {
      console.log('\nMigration completed! You can now apply the schema changes with: npx prisma db push --accept-data-loss');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateItemCustomerData };