# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Inventory & Finance Management System designed for automating inventory control operations, streamlining financial processes, managing customer and vendor accounts, and providing comprehensive reporting capabilities. The system is built as an Electron desktop application with a React frontend and Node.js/Express backend.

## Architecture

### Hybrid Electron Architecture

**IMPORTANT**: This is a hybrid Electron desktop application with a unique architecture:
- **Local Backend**: Each Electron instance runs its own Node.js/Express backend bundled locally for offline processing
- **Cloud Database**: All instances connect to a centralized Supabase PostgreSQL database for shared data storage
- **No Clustering**: Single-threaded Node.js per Electron instance (PM2/clustering not applicable)
- **No Shared Cache**: In-memory caching per instance (Redis not applicable for desktop app)
- **Connection Pooling**: Critical to prevent exhausting Supabase connection limits across multiple Electron instances

### Full Stack Structure
- **Frontend**: React 18 with Ant Design UI components, running in Electron for desktop app distribution
- **Backend**: Node.js with Express.js REST API (bundled locally per Electron instance)
- **Database**: PostgreSQL via Supabase (centralized cloud database) with Prisma ORM
- **State Management**: Zustand for React state management
- **Authentication**: JWT-based authentication with role-based access control

### Backend Architecture Pattern (Service-Controller-Route)

The backend follows a three-layer architecture:

1. **Routes** (`src/routes/`): Define API endpoints and middleware
2. **Controllers** (`src/controllers/`): Handle HTTP requests/responses, input validation
3. **Services** (`src/services/`): Contain business logic, database operations, transaction management

Key services structure:
- `invoiceService.js` / `invoiceLifecycleService.js`: Invoice creation and lifecycle management
- `billService.js` / `purchaseOrderService.js`: Purchase order and vendor bill management
- `paymentService.js` / `customerPaymentService.js`: Payment processing and ledger updates
- `inventoryService.js` / `inventoryLifecycleService.js`: Inventory CRUD and status tracking
- `reservationService.js`: Item reservation system for preventing concurrent modifications
- `backgroundCleanupService.js`: Automated cleanup of expired reservations
- `validationService.js`: Business rule validation (e.g., bill amounts vs PO totals)
- `automationService.js`: Automated journal entries and ledger updates

### Frontend Architecture

- **Layouts**: `PublicLayout` (login) and `PrivateLayout` (authenticated app with sidebar navigation)
- **Pages**: Organized by feature domains (inventory/, finance/, reports/, settings/)
- **Components**: Reusable UI components including modals, forms, tables
- **Stores**: Zustand stores for client state (currently only `authStore.js`)
- **Routing**: React Router v6 with nested routes under `/app/*`

### Key Directories
- `frontend/`: React Electron app
  - `src/pages/`: Main application pages (inventory, finance, reports)
  - `src/components/`: Reusable React components
  - `src/stores/`: Zustand state stores
  - `src/layouts/`: Layout components for public/private routes
- `backend/`: Express.js API server
  - `src/controllers/`: Route handlers
  - `src/services/`: Business logic layer
  - `src/routes/`: API route definitions
  - `src/middleware/`: Express middleware (auth, validation, error handling)
  - `src/config/`: Database and logger configuration
  - `prisma/`: Database schema and migrations

## Development Commands

### Backend (run from `backend/` directory)
- `npm run dev` - Start development server with nodemon
- `npm start` - Start production server
- `npm test` - Run Jest tests
- `npm run db:migrate` - Run Prisma database migrations
- `npm run db:push` - Push schema changes to database
- `npm run db:seed` - Seed database with initial data
- `npm run db:studio` - Open Prisma Studio database viewer

### Frontend (run from `frontend/` directory)
- `npm start` - Start React development server
- `npm run build` - Build React app for production
- `npm run electron-dev` - Run Electron app in development
- `npm run electron` - Run Electron app in production
- `npm run dist` - Build Electron app for distribution
- `npm run pack` - Package Electron app without building installer

## Database Schema

The system uses Prisma with PostgreSQL and includes comprehensive models for:

### Core Entities
- **User Management**: Users with role-based permissions
- **Product Catalog**: Categories, Companies, ProductModels for organizing inventory
- **Inventory**: Items with serial numbers, status tracking, specifications
- **Customer Management**: Customer profiles with financial tracking
- **Vendor Management**: Supplier information and purchase orders

### Financial System
- **Invoicing**: Complete invoice lifecycle with line items
- **Payments**: Payment tracking with multiple methods
- **Installments**: Support for installment payment plans
- **Ledgers**: Customer and vendor financial ledgers
- **General Ledger**: Double-entry accounting system

### Inventory Status Management

Items have two separate status fields:
- `status`: Physical location ("In Store", "In Hand", "In Lab", "Sold", "Delivered", "Handover")
- `inventoryStatus`: Availability ("Available", "Reserved", "Sold", "Delivered")

Status changes are tracked via:
- `InventoryStatusHistory`: Audit trail for all status changes
- `InventoryMovement`: Movement tracking for physical transfers

### Reservation System

The system uses an optimistic locking mechanism via `ItemReservation` to prevent concurrent modifications:
- Reservations are created when users start creating invoices
- Each reservation has a `sessionId` to group related items
- Reservations expire automatically (managed by `backgroundCleanupService`)
- Items can only be reserved if `inventoryStatus = "Available"`

### Soft Delete Pattern

Most entities use soft deletes via `deletedAt` timestamp rather than hard deletes:
- Invoices: Use `cancelledAt` + `cancelReason` for audit trail
- Bills: Use `cancelledAt` + `cancelReason`
- Payments: Use `voidedAt` + `voidReason` for immutability

### Audit Trails

Two specialized audit models track financial operations:
- `InvoicePaymentAudit`: Tracks all invoice and payment state changes
- `POBillAudit`: Tracks purchase order, bill, and vendor payment changes

### Key Features
- Serial number based inventory tracking
- Barcode scanning support (via @ericblade/quagga2)
- Status history tracking for items
- Comprehensive financial reporting
- Role-based access control
- Import/Export functionality for Excel files
- Optimistic locking for concurrent operations
- Decimal precision (18,4) for financial calculations

## Critical Business Rules

### Invoice-to-Payment Flow
1. Invoice created → Items reserved → `inventoryStatus = "Reserved"`
2. Payment recorded → Invoice status updated → `inventoryStatus = "Sold"`
3. Invoice cancelled → Reservations released → `inventoryStatus = "Available"`

### Purchase Order-to-Bill Flow
1. PO created with line items (category/model/specs, not actual serial numbers)
2. Bills created against PO → `PO.billedAmount` incremented
3. Validation: `SUM(bills.total) <= PO.total` enforced in `validationService.js`
4. Items added to inventory separately with `purchaseOrderId` reference

### Precision and Rounding
- All monetary values use `DECIMAL(18,4)` for high precision
- Tax calculations maintain 4 decimal places
- Final invoice/bill totals use 4 decimal places

## Environment Configurationwdwwa

### Backend Environment Variables
- `DATABASE_URL`: PostgreSQL connection string (Supabase)
- `JWT_SECRET`: Secret for JWT token signing
- `SUPABASE_URL` & `SUPABASE_ANON_KEY`: Supabase configuration
- `PORT`: Server port (default 3001)
- `NODE_ENV`: Environment (development/production)

### Frontend Environment Variables
- `REACT_APP_API_URL`: Backend API base URL (default: http://localhost:3001/api)

### System Configuration
- **Currency**: PKR (Pakistani Rupee) - Fixed configuration
- **Timezone**: Asia/Karachi (Pakistan Standard Time) - Fixed configuration
- **Date Format**: DD/MM/YYYY (Pakistan standard)
- **Target Market**: Pakistan

## Technology Stack

### Frontend Dependencies
- React 18 with React Router v6 for navigation
- Ant Design v5 for UI components
- Axios for HTTP requests with JWT interceptors
- React Query v3 for server state management
- Zustand for client state management
- Electron for desktop app packaging
- @ericblade/quagga2 for barcode scanning
- Recharts for data visualization
- dayjs for date manipulation

### Backend Dependencies
- Express.js with security middleware (helmet, cors, rate limiting)
- Prisma ORM for database operations
- JWT for authentication
- Winston for logging
- Multer for file uploads
- ExcelJS/XLSX for Excel file processing
- moment-timezone for timezone handling
- Jest + Supertest for testing
- bcryptjs for password hashing

## Development Notes

- The backend runs on port 3001 by default
- Frontend connects to backend via configured API URL
- Database migrations should be run before starting development
- The system uses UUID primary keys throughout
- All monetary values use Decimal type for precision
- Soft deletes are implemented via `deletedAt` timestamp
- Authentication tokens expire in 24 hours by default
- Axios interceptors automatically attach JWT tokens to requests
- 401 responses automatically trigger logout and redirect to login
