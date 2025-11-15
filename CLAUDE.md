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
- `validationService.js`: Business rule validation (e.g., bill amounts vs PO totals, ledger reconciliation)
- `schedulerService.js`: Background job scheduler using node-cron for automated tasks
- `financialReportService.js` / `financialReportsService.js`: Financial reporting and analytics
- `journalEntryService.js` / `ledgerService.js`: General ledger and journal entry management
- `pdfService.js`: PDF generation for invoices, bills, and reports
- `dashboardService.js`: Dashboard metrics and analytics
- `reportService.js`: General reporting service
- `importExportService.js`: Excel import/export functionality
- `authService.js` / `userService.js` / `roleService.js`: Authentication and user management
- `customerService.js`: Customer management operations
- `settingsService.js`: System settings management

### Background Scheduler Service

The system includes an automated scheduler (`schedulerService.js`) that runs periodic background jobs:

1. **Overdue Invoice Updates** (Daily at midnight)
   - Automatically marks invoices as "Overdue" when past due date
   - Uses locking mechanism to prevent concurrent execution
   - Timezone: Asia/Karachi (Pakistan Standard Time)

2. **Expired Reservation Cleanup** (Every 30 minutes + Every hour)
   - Releases items with expired reservations back to "Available" status
   - Deletes expired reservation records
   - Critical for preventing inventory lockup from abandoned transactions

3. **Ledger Reconciliation** (Daily at 2 AM)
   - Reconciles customer and vendor balances against ledger entries
   - Detects and logs discrepancies for audit
   - Validates financial data integrity across the system

**Important**: The scheduler starts automatically when the backend server starts via `schedulerService.start()` in `server.js`.

### Frontend Architecture

- **Layouts**: `PublicLayout` (login) and `PrivateLayout` (authenticated app with sidebar navigation)
- **Pages**: Organized by feature domains (inventory/, finance/, reports/, settings/)
  - `inventory/`: Categories, Companies, Models, Items, Vendors, BulkAddItems
  - `finance/`: Invoices, Payments, Customers, PurchaseOrders, VendorBills, VendorPayments
  - `reports/`: Various financial and inventory reports
  - `settings/`: Users, Roles, Profile, System Settings
- **Components**: Reusable UI components including modals, forms, tables
  - `reports/`: ARAgingReport, BalanceSheet, ProfitLossStatement, CashFlowReport, GrossProfitMarginReport, InventoryTurnoverReport
  - Form components: SpecificationForm, TemplateBuilder, GroupedItemSelector, PurchaseOrderItemSelector
  - Utility components: BarcodeScanner, HandoverModal, LedgerView, CustomerStatement
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

The system uses Prisma with PostgreSQL (via Supabase) and includes comprehensive models for:

### Complete Database Models List

**User & Access Management**
- `User`: User accounts with role-based permissions and activity tracking
- `Role`: Roles with JSON-based permissions array

**Product Catalog**
- `ProductCategory`: Product categories with specification templates
- `Company`: Manufacturer/brand companies
- `ProductModel`: Product models linking categories and companies

**Inventory Management**
- `Item`: Individual inventory items with serial numbers, dual status tracking (physical + availability)
- `InventoryStatusHistory`: Audit trail for all inventory status changes
- `InventoryMovement`: Physical movement tracking (purchases, sales, transfers, handovers)
- `ItemReservation`: Optimistic locking system for concurrent transaction prevention

**Customer & Vendor Management**
- `Customer`: Customer profiles with financial balances and credit limits
- `Vendor`: Supplier profiles with financial balances and payment terms

**Purchase Management**
- `PurchaseOrder`: Purchase orders with line items and billed amount tracking
- `PurchaseOrderItem`: Line items for purchase orders (category/model/specs, not actual items)
- `Bill`: Vendor bills linked to purchase orders
- `BillItem`: Line items for bills
- `VendorPayment`: Payments to vendors
- `VendorLedger`: Vendor financial ledger entries

**Sales & Invoicing**
- `Invoice`: Sales invoices with comprehensive status tracking and soft-cancel
- `InvoiceItem`: Line items linking invoices to actual inventory items
- `Payment`: Customer payments with void mechanism
- `CustomerLedger`: Customer financial ledger entries

**Financial System**
- `Account`: Chart of accounts with hierarchical structure
- `JournalEntry`: General ledger double-entry journal entries

**Audit & Tracking**
- `InvoicePaymentAudit`: Complete audit trail for invoice and payment operations
- `POBillAudit`: Complete audit trail for purchase order, bill, and vendor payment operations

**System Configuration**
- `SystemSettings`: Key-value store for system settings (general, inventory, finance, etc.)

### Core Entities
- **User Management**: Users with role-based permissions, activity tracking across all operations
- **Product Catalog**: Categories with customizable specification templates, Companies, ProductModels
- **Inventory**: Items with unique serial numbers, dual-status tracking, JSON specifications
- **Customer Management**: Customer profiles with financial tracking, credit limits, NIC/GSTIN
- **Vendor Management**: Supplier information, payment terms, tax numbers

### Financial System
- **Invoicing**: Complete invoice lifecycle with line items, soft-cancel mechanism, COGS tracking
- **Payments**: Payment tracking with multiple methods (Cash, Bank Transfer, Cheque, UPI, Card)
- **Ledgers**: Separate customer and vendor ledgers with running balance
- **General Ledger**: Double-entry accounting with Account hierarchy and JournalEntry tracking

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
- **Serial Number Tracking**: Unique serial number based inventory with existence validation
- **Barcode Scanning**: Real-time barcode scanning via @ericblade/quagga2
- **Dual Status Tracking**: Separate physical location and availability status for items
- **Status History**: Complete audit trail for all inventory status changes
- **Comprehensive Reporting**:
  - Financial: AR Aging, Balance Sheet, Profit & Loss, Cash Flow, Gross Profit Margin
  - Inventory: Inventory Turnover, Stock Status, Movement History
- **Print Functionality**: PDF generation for invoices, vendor bills, purchase orders, and reports
- **Role-Based Access Control**: Granular permissions system with JSON-based permission arrays
- **Import/Export**: Excel file import/export for bulk operations
- **Optimistic Locking**: Item reservation system prevents concurrent modification conflicts
- **High Precision**: DECIMAL(18,4) throughout with Decimal.js for calculation integrity
- **Automated Background Jobs**: Scheduled tasks for overdue invoices, reservation cleanup, ledger reconciliation
- **Financial Integrity**: Automated ledger reconciliation and validation
- **Audit Trails**: Complete audit logging for invoices, payments, bills, and purchase orders

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
- All monetary values use `DECIMAL(18,4)` in database for high precision
- **Decimal.js library** used in backend services for precise decimal arithmetic
- Tax calculations maintain 4 decimal places throughout
- Final invoice/bill totals use 4 decimal places
- Running balances in ledgers maintain 4 decimal places
- **IMPORTANT**: Always use Decimal.js when performing calculations on monetary values to avoid floating-point precision errors

## Environment Configuration

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
- **React 18** with React DOM for UI framework
- **React Router v6** for client-side routing and navigation
- **Ant Design v5** (@ant-design/icons) for comprehensive UI component library
- **Axios** for HTTP requests with JWT interceptors and automatic auth handling
- **React Query v3** for server state management, caching, and data fetching
- **Zustand** for client-side state management (auth store)
- **Electron v27** for desktop app packaging and distribution
- **electron-builder** for building cross-platform installers
- **@ericblade/quagga2** for real-time barcode scanning
- **Recharts** for charts and data visualization
- **dayjs** for date manipulation and formatting
- **react-hook-form** for form state management and validation
- **react-beautiful-dnd** for drag-and-drop functionality
- **cross-env** for cross-platform environment variables

### Backend Dependencies
- **Express.js** with security middleware (helmet, cors, express-rate-limit, compression)
- **Prisma ORM** v6.16.3 for database operations
- **Supabase Client** for cloud database connectivity
- **JWT** (jsonwebtoken) for authentication
- **Winston** for structured logging
- **Decimal.js** for high-precision decimal arithmetic
- **node-cron** for scheduled background jobs
- **pdfkit** for PDF generation
- **Multer** for file uploads
- **ExcelJS/XLSX** for Excel file import/export
- **express-validator** for request validation
- **express-async-handler** for async route error handling
- **bcryptjs** for password hashing
- **Jest + Supertest** for unit and integration testing
- **jest-mock-extended** for advanced mocking
- **morgan** for HTTP request logging
- **dotenv** for environment variable management

## Development Notes

### General Development Guidelines
- The backend runs on port 3001 by default
- Frontend connects to backend via `REACT_APP_API_URL` environment variable
- Database migrations should be run before starting development
- The system uses UUID primary keys throughout all tables
- All monetary values use Decimal type (DECIMAL(18,4)) for precision
- Soft deletes are implemented via `deletedAt` timestamp on most models
- Authentication tokens (JWT) expire in 24 hours by default
- Axios interceptors automatically attach JWT tokens to all API requests
- 401 responses automatically trigger logout and redirect to login page

### Working with Financial Data
- **ALWAYS** use Decimal.js for monetary calculations in backend services
- Never use JavaScript's native number arithmetic for money
- Convert Decimal values to strings when sending to frontend
- Maintain 4 decimal places throughout calculations
- Example:
  ```javascript
  const Decimal = require('decimal.js');
  const total = new Decimal(subtotal).plus(taxAmount);
  ```

### Database Operations
- Use Prisma Client for all database operations
- Always handle soft deletes with `where: { deletedAt: null }`
- Use transactions for multi-step operations (invoices, payments, ledger updates)
- Add appropriate indexes for frequently queried fields
- Use `@db.Decimal(18, 4)` for all monetary fields in schema

### Testing
- Unit tests in `backend/__tests__/` for services and controllers
- Use Jest with Supertest for API endpoint testing
- Mock Prisma Client using jest-mock-extended
- Run tests with `npm test` in backend directory
- Test coverage includes reservation system, validation, and financial services

### Error Handling
- Use express-async-handler for async route handlers
- Winston logger for structured error logging
- HTTP status codes: 400 (validation), 401 (auth), 403 (forbidden), 404 (not found), 500 (server error)
- Return user-friendly error messages in production

### Background Jobs
- Scheduler automatically starts with backend server
- All scheduled jobs use Asia/Karachi timezone
- Jobs log execution results to Winston logger
- Monitor logs for reconciliation warnings and errors

### Security Best Practices
- All passwords hashed with bcryptjs before storage
- JWT tokens stored in Zustand auth store (client-side)
- Rate limiting enabled on all API routes
- Helmet middleware for security headers
- CORS configured for frontend origin
- Input validation on all endpoints using express-validator

### Performance Optimization
- Connection pooling configured for Supabase (critical for multi-instance Electron)
- Indexes added for common query patterns
- Pagination implemented for large data sets
- React Query for frontend caching and automatic refetching

## Common Development Workflows

### Adding a New Feature

1. **Backend Service Layer**: Implement business logic in appropriate service file
2. **Backend Controller**: Create controller methods for HTTP request handling
3. **Backend Routes**: Define API endpoints in route files
4. **Frontend API Integration**: Add API calls using Axios
5. **Frontend UI**: Create/update React components and pages
6. **Testing**: Write unit tests for services and integration tests for endpoints

### Modifying Financial Flows

1. **Update Service Layer**: Modify invoice/payment/bill services with Decimal.js calculations
2. **Update Ledger Logic**: Ensure ledger entries are created/updated correctly
3. **Add Audit Trail**: Update InvoicePaymentAudit or POBillAudit tables
4. **Update Validation**: Add/modify validation rules in validationService.js
5. **Test Reconciliation**: Verify ledger reconciliation job handles changes correctly

### Adding New Database Models

1. **Update Prisma Schema**: Add model to `backend/prisma/schema.prisma`
2. **Create Migration**: Run `npm run db:migrate` to generate migration
3. **Update Services**: Create/update service files for business logic
4. **Add Indexes**: Include appropriate indexes for query performance
5. **Soft Delete**: Consider adding `deletedAt` field for audit compliance

### Debugging Common Issues

**Reservation Conflicts**
- Check `ItemReservation` table for expired reservations
- Verify cleanup job is running (check Winston logs)
- Manually release items: set `inventoryStatus = "Available"`, clear `reservedForId`

**Ledger Mismatches**
- Review `InvoicePaymentAudit` and `POBillAudit` for operation history
- Run ledger reconciliation manually via validationService
- Check for voided payments or cancelled invoices

**Decimal Precision Errors**
- Ensure all calculations use Decimal.js, not JavaScript numbers
- Verify database fields use DECIMAL(18,4) type
- Check that values are properly converted when sending to frontend

**Background Jobs Not Running**
- Verify `schedulerService.start()` is called in `server.js`
- Check Winston logs for job execution messages
- Confirm timezone is set to Asia/Karachi in job configuration

## API Endpoint Patterns

### Standard REST Endpoints
- `GET /api/{resource}` - List all (with pagination and filters)
- `GET /api/{resource}/:id` - Get single resource
- `POST /api/{resource}` - Create new resource
- `PUT /api/{resource}/:id` - Update resource
- `DELETE /api/{resource}/:id` - Soft delete (set deletedAt)

### Financial Endpoints
- `POST /api/invoices/:id/cancel` - Cancel invoice (soft-cancel)
- `POST /api/payments/:id/void` - Void payment (immutable pattern)
- `POST /api/invoices/:id/payments` - Record payment against invoice
- `GET /api/customers/:id/ledger` - Get customer ledger entries
- `GET /api/customers/:id/statement` - Generate customer statement

### Special Operations
- `POST /api/reservations/reserve` - Reserve items for transaction
- `POST /api/reservations/release` - Release reserved items
- `GET /api/reports/{reportType}` - Generate specific report
- `POST /api/import` - Import Excel data
- `GET /api/export` - Export data to Excel
