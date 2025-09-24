// ========== src/utils/generateId.js ==========
/**
 * Generate custom IDs for various entities
 */

const generateSerialNumber = async (category, year, prismaInstance = null) => {
  const db = require('../config/database');
  const prisma = prismaInstance || db.prisma;

  // Get the last serial number for this category and year
  const lastItem = await prisma.item.findFirst({
    where: {
      serialNumber: {
        startsWith: `${category}-${year}-`
      }
    },
    orderBy: {
      serialNumber: 'desc'
    }
  });

  let nextNumber = 1;

  if (lastItem) {
    const lastNumber = parseInt(lastItem.serialNumber.split('-').pop());
    nextNumber = lastNumber + 1;
  }

  return `${category}-${year}-${nextNumber.toString().padStart(4, '0')}`;
};

const generateInvoiceNumber = async (prismaInstance = null) => {
  const db = require('../config/database');
  const prisma = prismaInstance || db.prisma;
  const year = new Date().getFullYear();
  const month = (new Date().getMonth() + 1).toString().padStart(2, '0');

  const lastInvoice = await prisma.invoice.findFirst({
    where: {
      invoiceNumber: {
        startsWith: `INV-${year}${month}-`
      }
    },
    orderBy: {
      invoiceNumber: 'desc'
    }
  });

  let nextNumber = 1;

  if (lastInvoice) {
    const lastNumber = parseInt(lastInvoice.invoiceNumber.split('-').pop());
    nextNumber = lastNumber + 1;
  }

  return `INV-${year}${month}-${nextNumber.toString().padStart(4, '0')}`;
};

const generatePONumber = async (prismaInstance = null) => {
  const db = require('../config/database');
  const prisma = prismaInstance || db.prisma;
  const year = new Date().getFullYear();

  const lastPO = await prisma.purchaseOrder.findFirst({
    where: {
      poNumber: {
        startsWith: `PO-${year}-`
      }
    },
    orderBy: {
      poNumber: 'desc'
    }
  });

  let nextNumber = 1;

  if (lastPO) {
    const lastNumber = parseInt(lastPO.poNumber.split('-').pop());
    nextNumber = lastNumber + 1;
  }

  return `PO-${year}-${nextNumber.toString().padStart(5, '0')}`;
};

const generatePaymentNumber = async (type = 'PAY', prismaInstance = null) => {
  const db = require('../config/database');
  const prisma = prismaInstance || db.prisma;
  const year = new Date().getFullYear();
  const month = (new Date().getMonth() + 1).toString().padStart(2, '0');

  const model = type === 'VPAY' ? 'vendorPayment' : 'payment';

  const lastPayment = await prisma[model].findFirst({
    where: {
      paymentNumber: {
        startsWith: `${type}-${year}${month}-`
      }
    },
    orderBy: {
      paymentNumber: 'desc'
    }
  });

  let nextNumber = 1;

  if (lastPayment) {
    const lastNumber = parseInt(lastPayment.paymentNumber.split('-').pop());
    nextNumber = lastNumber + 1;
  }

  return `${type}-${year}${month}-${nextNumber.toString().padStart(4, '0')}`;
};

module.exports = {
  generateSerialNumber,
  generateInvoiceNumber,
  generatePONumber,
  generatePaymentNumber
};