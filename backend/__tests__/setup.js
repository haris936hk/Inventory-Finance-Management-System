// Test setup file - runs before all tests
const { mockDeep, mockReset } = require('jest-mock-extended');

// Create mock Prisma instance
const createPrismaMock = () => mockDeep();

// Mock the database module
jest.mock('../src/config/database', () => {
  const mockPrisma = createPrismaMock();
  return {
    prisma: mockPrisma,
    transaction: jest.fn((callback) => callback(mockPrisma)),
    softDelete: jest.fn(),
    restore: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn()
  };
});

// Mock logger to prevent console spam during tests
jest.mock('../src/config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

// Mock UUID for session ID generation
jest.mock('uuid');

// Mock Supabase for system tests
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn(),
        download: jest.fn(),
        remove: jest.fn(),
        getPublicUrl: jest.fn(() => ({ data: { publicUrl: 'mock-url' } }))
      }))
    }
  }))
}));

// Mock generateId utilities
jest.mock('../src/utils/generateId', () => ({
  generateSerialNumber: jest.fn((category, year) => `${category}-${year}-0001`),
  generateInvoiceNumber: jest.fn(() => 'INV-202501-0001'),
  generatePONumber: jest.fn(() => 'PO-2025-00001'),
  generateBillNumber: jest.fn(() => 'BILL-202501-0001'),
  generatePaymentNumber: jest.fn(() => 'PAY-202501-0001')
}));

// Global test data
global.testData = {
  // Test UUIDs
  validUuid: '123e4567-e89b-12d3-a456-426614174000',
  categoryId: '223e4567-e89b-12d3-a456-426614174001',
  companyId: '323e4567-e89b-12d3-a456-426614174002',
  modelId: '423e4567-e89b-12d3-a456-426614174003',
  itemId: '523e4567-e89b-12d3-a456-426614174004',
  vendorId: '623e4567-e89b-12d3-a456-426614174005',
  warehouseId: '723e4567-e89b-12d3-a456-426614174006',
  userId: '823e4567-e89b-12d3-a456-426614174007',
  customerId: '923e4567-e89b-12d3-a456-426614174008',
  invoiceId: 'a23e4567-e89b-12d3-a456-426614174009',

  // Sample category
  category: {
    id: '223e4567-e89b-12d3-a456-426614174001',
    name: 'Electronics',
    code: 'ELEC',
    description: 'Electronic devices',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    deletedAt: null
  },

  // Sample company
  company: {
    id: '323e4567-e89b-12d3-a456-426614174002',
    name: 'Apple Inc',
    code: 'APPL',
    email: 'contact@apple.com',
    phone: '1234567890',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    deletedAt: null
  },

  // Sample model
  model: {
    id: '423e4567-e89b-12d3-a456-426614174003',
    name: 'iPhone 15 Pro',
    code: 'IP15P',
    description: 'Latest iPhone model',
    categoryId: '223e4567-e89b-12d3-a456-426614174001',
    companyId: '323e4567-e89b-12d3-a456-426614174002',
    isActive: true,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    deletedAt: null
  },

  // Sample item
  item: {
    id: '523e4567-e89b-12d3-a456-426614174004',
    serialNumber: 'ELEC-2025-0001',
    condition: 'New',
    status: 'In Store',
    inventoryStatus: 'Available',
    specifications: { color: 'Black', storage: '256GB' },
    purchasePrice: 150000,
    sellingPrice: 180000,
    purchaseDate: new Date('2025-01-01'),
    inboundDate: new Date('2025-01-01'),
    outboundDate: null,
    categoryId: '223e4567-e89b-12d3-a456-426614174001',
    modelId: '423e4567-e89b-12d3-a456-426614174003',
    vendorId: '623e4567-e89b-12d3-a456-426614174005',
    warehouseId: '723e4567-e89b-12d3-a456-426614174006',
    customerId: null,
    statusHistory: [
      {
        status: 'In Store',
        date: new Date('2025-01-01'),
        userId: '823e4567-e89b-12d3-a456-426614174007',
        notes: 'Initial entry'
      }
    ],
    createdById: '823e4567-e89b-12d3-a456-426614174007',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    deletedAt: null,
    reservedAt: null,
    reservedBy: null,
    reservedForType: null,
    reservedForId: null,
    reservationExpiry: null
  },

  // Sample vendor
  vendor: {
    id: '623e4567-e89b-12d3-a456-426614174005',
    name: 'Tech Supplies Ltd',
    code: 'TSL',
    email: 'vendor@techsupplies.com',
    phone: '9876543210',
    address: '123 Tech Street',
    contactPerson: 'John Doe',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    deletedAt: null
  },

  // Sample warehouse
  warehouse: {
    id: '723e4567-e89b-12d3-a456-426614174006',
    name: 'Main Warehouse',
    code: 'MW',
    location: 'Karachi',
    isActive: true,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01')
  }
};

// Provide the mock to be imported by tests
const db = require('../src/config/database');
global.prismaMock = db.prisma;

// Reset mocks before each test
beforeEach(() => {
  if (global.prismaMock && typeof mockReset === 'function') {
    mockReset(global.prismaMock);
  }
  jest.clearAllMocks();

  // Set up UUID mock
  const uuid = require('uuid');
  if (uuid && uuid.v4) {
    uuid.v4.mockReturnValue('test-session-id-12345');
  }
});

// Cleanup after all tests
afterAll(() => {
  jest.restoreAllMocks();
});
