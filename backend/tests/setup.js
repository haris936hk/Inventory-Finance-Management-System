// Test setup file
const { PrismaClient } = require('@prisma/client');

// Mock Prisma Client
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
  },
  role: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
  },
  productCategory: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  company: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  productModel: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
  item: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
  },
  customer: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  vendor: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  invoice: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  payment: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  vendorPayment: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  purchaseOrder: {
    findFirst: jest.fn(),
  },
  installmentPlan: {
    create: jest.fn(),
    findUnique: jest.fn(),
  },
  installment: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  customerLedger: {
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

// Mock database module
jest.mock('../src/config/database', () => ({
  prisma: mockPrisma,
  findMany: jest.fn(),
  findUnique: jest.fn(),
  softDelete: jest.fn(),
  restore: jest.fn(),
}));

// Mock logger
jest.mock('../src/config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

// Mock generateId utilities
jest.mock('../src/utils/generateId', () => ({
  generateSerialNumber: jest.fn(() => 'TEST-12345'),
  generateInvoiceNumber: jest.fn(() => 'INV-2023-001'),
  generatePONumber: jest.fn(() => 'PO-2023-001'),
  generatePaymentNumber: jest.fn(() => 'PAY-2023-001')
}));

global.mockPrisma = mockPrisma;

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});