const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function fixCategoryActiveStatus() {
  try {
    console.log('🔧 Fixing isActive status for categories and companies...');

    // Update categories where isActive is null or false to true
    const categoryUpdateResult = await prisma.productCategory.updateMany({
      where: {
        OR: [
          { isActive: null },
          { isActive: false }
        ]
      },
      data: {
        isActive: true
      }
    });

    console.log(`✅ Updated ${categoryUpdateResult.count} categories`);

    // Update companies where isActive is null or false to true
    const companyUpdateResult = await prisma.company.updateMany({
      where: {
        OR: [
          { isActive: null },
          { isActive: false }
        ]
      },
      data: {
        isActive: true
      }
    });

    console.log(`✅ Updated ${companyUpdateResult.count} companies`);

    // Update product models where isActive is null or false to true
    const modelUpdateResult = await prisma.productModel.updateMany({
      where: {
        OR: [
          { isActive: null },
          { isActive: false }
        ]
      },
      data: {
        isActive: true
      }
    });

    console.log(`✅ Updated ${modelUpdateResult.count} product models`);

    console.log('🎉 Fixed isActive status successfully!');
  } catch (error) {
    console.error('❌ Error fixing active status:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixCategoryActiveStatus();