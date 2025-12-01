# Codebase File Index

## Root Files
- `CLAUDE.md` - Project guidelines and architecture documentation for Claude Code, including service patterns, transaction management, and business rules for the inventory and finance management system.
- `.gitignore` - Git ignore configuration specifying excluded files and directories (node_modules, logs, environment files, build artifacts).
- `.claude/settings.local.json` - Local Claude Code settings file.

## Backend (`backend/`)

### Configuration (`backend/src/config/`)
- `constants.js` - System configuration constants for Pakistan (currency PKR, timezone Asia/Karachi, date formats).
- `database.js` - Prisma database wrapper class providing connection management, soft delete helpers, and transaction utilities.
- `logger.js` - Winston-based logger configuration with file and console transports for error and combined logs.
- `supabase.js` - Supabase storage client for file uploads, downloads, and signed URL management across multiple buckets.

### Controllers (`backend/src/controllers/`)
- `authController.js` - HTTP request handlers for login, token refresh, and password change operations.
- `dashboardController.js` - Handles dashboard statistics retrieval and metric aggregation requests.
- `financeController.js` - Controllers for invoice, payment, purchase order, and bill CRUD and state management operations.
- `importExportController.js` - Handles Excel import and data export operations with file processing.
- `inventoryController.js` - Controllers for inventory item CRUD, search, filtering, and bulk operations.
- `inventoryLifecycleController.js` - Handles inventory status transitions and lifecycle state management.
- `reportController.js` - Controllers for generating financial and operational reports.
- `reservationController.js` - Handles item reservation management for invoices and allocations.
- `roleController.js` - CRUD operations for user roles and permission management.
- `settingsController.js` - Handles system settings, company information, and configuration management.
- `userController.js` - User management controllers for create, read, update, and delete operations.

### Services (`backend/src/services/`)
- `authService.js` - Authentication logic including user registration, login, token generation/refresh, and password hashing.
- `billService.js` - Vendor bill management with PO tracking, bill validation, and payment status updates.
- `customerPaymentService.js` - Customer payment processing with invoice reconciliation and balance updates.
- `customerService.js` - Customer CRUD operations, duplicate validation, and financial metrics retrieval.
- `dashboardService.js` - Aggregated dashboard statistics including inventory, financial, customer, and purchase order metrics.
- `financialReportsService.js` - Financial report generation including profit/loss, balance sheet, and cash flow statements.
- `importExportService.js` - Excel import processing with data validation and database insertion, supports multiple import formats.
- `inventoryLifecycleService.js` - Item status transition management (Available → Reserved → Sold → Delivered) with audit trails.
- `inventoryService.js` - Inventory item CRUD, search, filtering, and bulk import/export operations.
- `invoiceLifecycleService.js` - Invoice status transition validation and state machine implementation.
- `invoiceService.js` - Invoice lifecycle management (Draft → Sent → Partial → Paid → Overdue → Cancelled) with inventory reservations.
- `ledgerService.js` - Customer and vendor ledger entry management for financial tracking and reconciliation.
- `paymentService.js` - Invoice payment recording with amount validation and ledger updates.
- `pdfService.js` - PDF generation for invoices, bills, and reports using pdfkit library.
- `purchaseOrderService.js` - PO lifecycle management with bill tracking and vendor coordination.
- `reportService.js` - Report data aggregation and formatting for various business reports.
- `reservationService.js` - Item reservation management for invoices with concurrent access control.
- `roleService.js` - Role and permission management with CRUD operations.
- `settingsService.js` - Application settings storage and retrieval (company info, tax rates, templates).
- `userService.js` - User management including creation, updates, password management, and permission checks.

### Routes (`backend/src/routes/`)
- `authRoutes.js` - API endpoints for authentication (login, logout, refresh, password change).
- `financeRoutes.js` - API endpoints for invoices, payments, purchase orders, and bills management.
- `importExportRoutes.js` - API endpoints for Excel import and data export operations.
- `inventoryRoutes.js` - API endpoints for inventory items, categories, companies, models, and vendors.
- `reportRoutes.js` - API endpoints for financial and operational report generation.
- `roleRoutes.js` - API endpoints for role and permission management.
- `settingsRoutes.js` - API endpoints for system settings and configuration.
- `userRoutes.js` - API endpoints for user CRUD and management operations.

### Middleware (`backend/src/middleware/`)
- `auth.js` - JWT authentication middleware, permission and role checking utilities.
- `decimalSerializer.js` - Middleware to convert Prisma Decimal objects to numbers for JSON serialization.
- `errorHandler.js` - Global error handling middleware with custom error type mapping and logging.
- `validation.js` - Express-validator result middleware for request validation error handling.

### Utils (`backend/src/utils/`)
- `transactionWrapper.js` - Transaction execution wrapper with retry logic, row-level locking, and custom error classes (ValidationError, ConcurrencyError, InsufficientBalanceError).
- `generateId.js` - ID generation utilities for invoices, purchase orders, bills, payments, and inventory serial numbers.
- `dateUtils.js` - Date formatting and manipulation utilities for Pakistan timezone (Asia/Karachi).

### Prisma (`backend/prisma/`)
- `schema.prisma` - PostgreSQL data model defining User, Role, Customer, Vendor, Item, Invoice, Bill, Payment, PurchaseOrder, and audit tables.
- `seed.js` - Database seeding script that creates initial roles with permissions and default admin user.

### Database Scripts
- `logs/combined.log` - Combined application log file (info, warn, error levels).
- `logs/error.log` - Error-specific application log file.

### System (`backend/system/`)
- `setup.js` - System test setup file with database cleanup and test data seeding utilities.
- `system.test.js` - System-level test configuration and teardown.

### Root Backend Files
- `package.json` - Backend dependencies and npm scripts (dev, start, migrations, testing).
- `package-lock.json` - Locked dependency versions.
- `.env` - Environment variables (DATABASE_URL, DIRECT_URL, JWT_SECRET, Supabase keys).
- `server.js` - Express server entry point with middleware setup, routes, and graceful shutdown.

## Frontend (`frontend/`)

### Root Frontend Files
- `package.json` - Frontend dependencies and npm scripts (start, build, electron-dev, dist, pack).
- `package-lock.json` - Locked dependency versions.
- `public/index.html` - HTML entry point for React application.
- `src/App.js` - Main React component with routing configuration, Axios interceptors, and authentication state management.
- `src/App.css` - Global application styles.
- `src/index.js` - React DOM render entry point.

### Pages (`frontend/src/pages/`)
- `LoginPage.jsx` - User authentication login form page.
- `Dashboard.jsx` - Main dashboard displaying inventory, financial, and operational metrics.

#### Inventory Pages (`frontend/src/pages/inventory/`)
- `AddItem.jsx` - Single item creation form with category, company, model, and specification fields.
- `BulkAddItems.jsx` - Bulk item import from Excel with validation and progress tracking.
- `InventoryList.jsx` - Inventory items list with search, filter, status, and column customization.
- `ItemDetails.jsx` - Detailed item view showing specifications, movement history, and status transitions.
- `Categories.jsx` - Product category management (CRUD operations).
- `Companies.jsx` - Manufacturer/vendor company management.
- `Models.jsx` - Product model management with category and company associations.
- `Vendors.jsx` - Vendor list and management.
- `VendorDetails.jsx` - Detailed vendor view with purchase orders and payment history.

#### Finance Pages (`frontend/src/pages/finance/`)
- `Customers.jsx` - Customer list with search and credit limit management.
- `CustomerDetails.jsx` - Customer profile with invoices, payments, and balance information.
- `Invoices.jsx` - Invoice list with status filtering, search, and bulk actions.
- `CreateInvoice.jsx` - Invoice creation form with item selection, customer details, and payment terms.
- `InvoiceDetails.jsx` - Invoice detail view with items, payments, and cancellation options.
- `Payments.jsx` - Customer payment list and reconciliation.
- `RecordPayment.jsx` - Payment recording form with invoice selection and amount validation.
- `PurchaseOrders.jsx` - Purchase order list with vendor and status filtering.
- `CreatePurchaseOrder.jsx` - PO creation form with item selection and vendor details.
- `PurchaseOrderDetails.jsx` - PO detail view with bills, items, and status transitions.
- `VendorBills.jsx` - Vendor bill list with status and amount information.
- `CreateVendorBill.jsx` - Bill creation form linked to purchase orders.
- `VendorBillDetails.jsx` - Bill detail view with payment tracking and vendor information.
- `VendorPayments.jsx` - Vendor payment list and history.
- `RecordVendorPayment.jsx` - Vendor payment recording form with bill reconciliation.

#### Reports Pages (`frontend/src/pages/reports/`)
- `Reports.jsx` - Report dashboard with various financial and operational report components.

#### Settings Pages (`frontend/src/pages/settings/`)
- `Users.jsx` - User management page with create, edit, and role assignment.
- `Settings.jsx` - System settings including company information and business configurations.
- `Profile.jsx` - Current user profile with password change option.

### Components (`frontend/src/components/`)
- `BarcodeScanner.jsx` - Barcode scanning component for inventory lookups.
- `CustomerStatement.jsx` - Customer financial statement display component.
- `FieldConfigurationModal.jsx` - Modal for configuring dynamic specification fields.
- `GroupedItemSelector.jsx` - Item selection component with grouping and filtering.
- `HandoverModal.jsx` - Modal for handover operations and item status transitions.
- `ImportModal.jsx` - File upload modal for Excel imports with progress and error reporting.
- `InventoryMovementHistory.jsx` - Component displaying item movement and status change history.
- `LedgerView.jsx` - Customer/vendor ledger display component with transaction details.
- `ProfileModal.jsx` - User profile editing modal.
- `PurchaseOrderItemSelector.jsx` - Item selection component specific to purchase orders.
- `SpecificationForm.jsx` - Dynamic form component for item specifications based on category template.
- `TemplateBuilder.jsx` - Template builder for customizable item specification fields.
- `UpdateRepairedStatusModal.jsx` - Modal for updating item repair status.

#### Report Components (`frontend/src/components/reports/`)
- `ARAgingReport.jsx` - Accounts receivable aging analysis report.
- `BalanceSheet.jsx` - Balance sheet financial report.
- `CashFlowReport.jsx` - Cash flow analysis report.
- `GrossProfitMarginReport.jsx` - Gross profit margin analysis report.
- `InventoryTurnoverReport.jsx` - Inventory turnover and movement analysis report.
- `ProfitLossStatement.jsx` - Profit and loss statement report.

### Stores (`frontend/src/stores/`)
- `authStore.js` - Zustand store for authentication state management (user, token, permissions, login/logout).

### Utils (`frontend/src/utils/`)
- `decimalUtils.js` - Decimal arithmetic utilities for consistent monetary calculations (formatAmount, parseAmount, compareAmounts, addAmounts, etc.).
- `dateUtils.js` - Date formatting and timezone utilities for Pakistan timezone using dayjs.
- `validationRules.js` - Centralized Ant Design form validation rules (phone, email, NIC, amount, etc.).
- `errorMessages.js` - User-friendly error message mapping for backend error codes and HTTP status codes.
- `templateValidation.js` - Specification template validation and field type definitions.
- `ERROR_MESSAGES_GUIDE.md` - Documentation for error message handling patterns.

### Layouts (`frontend/src/layouts/`)
- `PrivateLayout.jsx` - Protected layout with sidebar navigation, header, and permission-based menu for authenticated users.
- `PublicLayout.jsx` - Public layout for unauthenticated pages (login).

### Config (`frontend/src/config/`)
- `constants.js` - Business constants including payment methods, invoice/bill/PO statuses, inventory statuses, tax rates, validation patterns.

## Electron (`frontend/electron/`)
- `main.js` - Electron main process with window creation, application menu, and IPC event handlers for import/export.
- `preload.js` - Electron preload script with secure IPC channel exposure (menu-import, menu-export, file dialogs).

---

## Summary Statistics
- **Total Files**: 133 (excluding node_modules, .git, dist, build)
- **Backend Files**: ~85 (configs, controllers, services, routes, middleware, utils, scripts)
- **Frontend Files**: ~48 (pages, components, stores, utils, layouts, config)
- **Database**: Prisma ORM with PostgreSQL (Supabase)
- **Key Technologies**: React, Express, Prisma, PostgreSQL, Electron, Zustand, React Query, Ant Design, Axios
