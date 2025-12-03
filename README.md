# Inventory & Finance Management System

A comprehensive desktop application for managing inventory and financial operations, specifically designed for Pakistan-based small businesses dealing with battery and rectifier module inventory.

![License](https://img.shields.io/badge/license-Proprietary-red)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)
![Electron](https://img.shields.io/badge/electron-27.0.0-blue)
![React](https://img.shields.io/badge/react-18.0.0-blue)

## Overview

This full-stack desktop application combines inventory tracking with integrated financial management, providing a complete solution for small businesses to manage their products, customers, vendors, invoices, bills, payments, and purchase orders.

**Key Business Domain**: Product inventory tracking (batteries, rectifier modules) with integrated financial management and customer/vendor ledgers.

**Target Region**: Pakistan (PKR currency, Pakistan timezone, localized formats)

## Features

### Inventory Management
- **Item Tracking**: Comprehensive item management with specifications, serial numbers, and categories
- **Status Lifecycle**: Track items through their lifecycle (Available → Reserved → Sold → Delivered)
- **Bulk Operations**: Import/export items via Excel, bulk add items
- **Categories & Models**: Organize inventory by categories, companies, and models
- **Barcode Support**: Barcode scanning for quick item lookup
- **Movement History**: Complete audit trail of item status changes

### Financial Management
- **Customer Management**: Customer profiles with credit limits and balance tracking
- **Vendor Management**: Vendor profiles with payment terms and outstanding balances
- **Invoice Management**: Create, send, and track invoices with multiple statuses (Draft, Sent, Partial, Paid, Overdue, Cancelled)
- **Payment Processing**: Record customer and vendor payments with automatic invoice reconciliation
- **Purchase Orders**: Create and manage POs with bill tracking
- **Vendor Bills**: Track vendor bills linked to purchase orders

### Reporting & Analytics
- **Financial Reports**:
  - Profit & Loss Statement
  - Balance Sheet
  - Cash Flow Report
  - Gross Profit Margin Analysis
- **Operational Reports**:
  - Accounts Receivable Aging
  - Inventory Turnover Analysis
- **Dashboard Metrics**: Real-time statistics for inventory, finance, and operations

### User Management & Security
- **Role-Based Access Control**: Granular permissions for different user roles
- **JWT Authentication**: Secure token-based authentication
- **Audit Trails**: Complete tracking of financial transactions and state changes
- **Multi-User Support**: Multiple operators with different permission levels

## Architecture

```
┌─────────────────────────────────────────┐
│   Electron Desktop App (React UI)       │
├─────────────────────────────────────────┤
│   Node.js/Express Backend (Bundled)     │
├─────────────────────────────────────────┤
│   PostgreSQL Database (Supabase Cloud)  │
└─────────────────────────────────────────┘
```

- **Frontend**: React 18 + Electron (Desktop UI)
- **Backend**: Node.js + Express (Bundled with app)
- **Database**: PostgreSQL via Supabase (Cloud-hosted)
- **ORM**: Prisma for type-safe database access
- **State Management**: Zustand + React Query
- **UI Library**: Ant Design

## Tech Stack

### Frontend
- **React 18** - UI framework
- **Electron 27** - Desktop app wrapper
- **Ant Design** - UI component library
- **Zustand** - Global state management
- **React Query** - Server state management
- **React Router** - Navigation
- **Axios** - HTTP client
- **Day.js** - Date manipulation

### Backend
- **Node.js** - Runtime environment
- **Express** - Web framework
- **Prisma ORM** - Database toolkit
- **PostgreSQL** - Database
- **JWT** - Authentication
- **bcrypt** - Password hashing
- **Winston** - Logging
- **ExcelJS** - Excel import/export
- **PDFKit** - PDF generation

## Prerequisites

- **Node.js** 18.x or higher
- **npm** or **yarn**
- **Windows** (for building Windows installer)
- **PostgreSQL database** (Supabase account)
- **Git** (for version control)

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/Inventory-Finance-Management-System.git
cd Inventory-Finance-Management-System
```

### 2. Install Dependencies

**Frontend**:
```bash
cd frontend
npm install
```

**Backend**:
```bash
cd backend
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the `backend/` directory:

```env
# Database
DATABASE_URL="postgresql://user:password@host:5432/database?pgbouncer=true"
DIRECT_URL="postgresql://user:password@host:5432/database"

# JWT
JWT_SECRET="your-super-secret-jwt-key"
JWT_EXPIRES_IN="7d"
JWT_REFRESH_EXPIRES_IN="30d"

# Server
PORT=3001
NODE_ENV="development"

# Supabase Storage (Optional)
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_KEY="your-anon-key"
```

### 4. Setup Database

```bash
cd backend

# Run migrations
npm run db:migrate

# Seed initial data (roles and default admin user)
npm run db:seed
```

**Default Admin Credentials** (after seeding):
- Email: `admin@company.com`
- Password: `admin123`

⚠️ **Change these credentials immediately after first login!**

## Development

### Option 1: Automated (Recommended)

```bash
cd frontend
npm run electron-dev
```

This automatically starts both the React dev server and Electron.

### Option 2: Manual (Separate Terminals)

**Terminal 1 - Backend**:
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend**:
```bash
cd frontend
npm start
```

**Terminal 3 - Electron**:
```bash
cd frontend
npm run electron-dev
```

### Database Management

```bash
cd backend

# Run migrations
npm run db:migrate

# Push schema changes without migration
npm run db:push

# Seed database
npm run db:seed

# Open Prisma Studio (Database GUI)
npm run db:studio
```

## Building for Production

### Quick Build (from project root)

```bash
# Package without installer (for testing)
npm run pack

# Create Windows installer
npm run dist
```

### Step-by-Step Build

1. **Build Frontend**:
   ```bash
   cd frontend
   npm run build
   ```

2. **Prepare Backend**:
   ```bash
   cd backend
   npm install --production
   ```

3. **Package with Electron Builder**:
   ```bash
   cd ..  # Back to root
   npm run dist
   ```

### Build Output

After building, find your distributable files in:

- **Installer**: `dist/Inventory Finance System Setup 1.0.0.exe`
- **Unpacked App**: `dist/win-unpacked/` (for testing)

## Project Structure

```
├── frontend/                    # Electron + React application
│   ├── build/                  # React production build
│   ├── electron/               # Electron main process
│   │   ├── main.js            # Main process entry point
│   │   ├── preload.js         # Preload script
│   │   └── backend-manager.js # Backend process manager
│   ├── public/                # Static assets
│   ├── src/
│   │   ├── components/        # Reusable React components
│   │   ├── pages/             # Page components
│   │   │   ├── inventory/    # Inventory management pages
│   │   │   ├── finance/      # Finance management pages
│   │   │   ├── reports/      # Report pages
│   │   │   └── settings/     # Settings pages
│   │   ├── stores/            # Zustand state stores
│   │   ├── utils/             # Utility functions
│   │   ├── layouts/           # Layout components
│   │   └── config/            # Configuration constants
│   └── package.json
│
├── backend/                    # Node.js/Express API
│   ├── src/
│   │   ├── controllers/       # HTTP request handlers
│   │   ├── services/          # Business logic layer
│   │   ├── routes/            # API route definitions
│   │   ├── middleware/        # Express middleware
│   │   ├── config/            # Configuration files
│   │   └── utils/             # Utility functions
│   ├── prisma/
│   │   ├── schema.prisma      # Database schema
│   │   └── seed.js            # Database seeding script
│   ├── logs/                  # Application logs
│   └── package.json
│
├── scripts/                    # Build and utility scripts
├── package.json               # Root package for building
├── electron-builder.yml       # Electron builder configuration
├── CLAUDE.md                  # Development guidelines
└── README.md                  # This file
```

## Key Business Rules

### Invoice Management
- Items must be in "Available" status to be added to invoices
- Items are automatically reserved when added to invoice
- Cancelled invoices are excluded from statistics and balances
- On cancellation: Reserved items return to "Available"

### Payment Processing
- Cannot overpay an invoice
- Payments automatically update invoice status and customer balance
- Voided payments reverse all effects
- All payment transactions are logged in audit trail

### Purchase Order Flow
1. Create PO → Status: "Draft"
2. Send PO → Status: "Sent"
3. Create bill(s) → Status: "Partial" or "Completed"
4. Bill total cannot exceed PO total

### Inventory Status Transitions
- **Available** → **Reserved** (when added to invoice)
- **Reserved** → **Sold** (when invoice paid)
- **Sold** → **Delivered** (when customer receives item)

## Configuration

### Currency & Localization
- **Currency**: Pakistani Rupee (PKR)
- **Date Format**: DD/MM/YYYY
- **Timezone**: Asia/Karachi (UTC+5)
- **Phone Format**: 03XXXXXXXXX (11 digits)
- **CNIC Format**: 13 digits

### Port Configuration
- **Backend API**: Port 3001
- **Frontend Dev Server**: Port 3000 (development only)
- **Production**: Frontend served from files, Backend on 3001

## Decimal Precision

The system uses `DECIMAL(18,4)` for all monetary fields to ensure precision:

- Always use `formatAmount()` after calculations
- Never use `===` for decimal comparisons
- Use `compareAmounts()` for equality checks
- All amounts rounded to 4 decimal places

## Security Features

- **JWT-based Authentication**: Secure token-based auth with refresh tokens
- **Role-Based Access Control**: Granular permissions per user role
- **Password Hashing**: bcrypt for secure password storage
- **Audit Trails**: Complete tracking of all financial operations
- **Soft Deletes**: Records are marked as deleted, never hard deleted
- **Transaction Isolation**: Serializable isolation level for financial operations

## Troubleshooting

### Build Issues

**Cannot find module 'electron'**:
```bash
npm install  # From project root
```

**Frontend build fails**:
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run build
```

**Backend dependencies missing**:
```bash
cd backend
npm install
```

### Runtime Issues

**Backend doesn't start**:
- Check console logs (F12 in Electron)
- Verify port 3001 is available
- Check database connection in `.env`

**White screen in production**:
- Ensure `npm run build` was run in frontend
- Check DevTools (F12) for errors
- Verify backend is running (Task Manager → node.exe)

**Database connection fails**:
- Verify internet connection
- Check Supabase credentials in `.env`
- Test connection string directly

### Common Commands

```bash
# Frontend
cd frontend
npm start              # Start React dev server
npm run build          # Build for production
npm run electron-dev   # Run Electron in dev mode

# Backend
cd backend
npm run dev            # Start backend with auto-reload
npm run db:migrate     # Run database migrations
npm run db:seed        # Seed initial data
npm run db:studio      # Open Prisma Studio GUI
npm test               # Run tests

# Root (Building)
npm run pack           # Package without installer
npm run dist           # Create Windows installer
```

## Development Guidelines

### Transaction Management
All financial operations MUST use transaction wrappers to ensure data consistency:
- Automatic retry on deadlock/serialization errors
- Row-level locking for concurrent access
- Custom error handling (ValidationError, ConcurrencyError)

### Service Layer Pattern
Backend follows **Controller → Service → Database** architecture:
- Controllers handle HTTP requests/responses
- Services contain all business logic
- Database operations only in services

### Validation
- Use centralized validation rules from `validationRules.js`
- Use centralized error messages via `getErrorMessage()`
- Validate at API boundaries, not internal code

## Testing

```bash
cd backend
npm test
```

- Unit tests for services and utilities
- Integration tests for API endpoints
- Transaction rollback scenarios
- Concurrency testing

## Contributing

This is a proprietary project. For internal development:

1. Create a feature branch
2. Make changes following the guidelines in `CLAUDE.md`
3. Test thoroughly (manual + automated)
4. Create pull request for review
5. Ensure all tests pass before merging

## Deployment

### Production Deployment

1. Build the application: `npm run dist`
2. Distribute the installer: `dist/Inventory Finance System Setup 1.0.0.exe`
3. Users install and run
4. Ensure database connection string is configured in `.env`

### Database Migrations

For production database updates:
```bash
cd backend
npx prisma migrate deploy  # Apply pending migrations
```

## License

**Proprietary - All Rights Reserved**

This software is proprietary and confidential. Unauthorized copying, distribution, or use is strictly prohibited.

## Support

For issues, questions, or support:
- **Internal Issues**: Contact your system administrator
- **Bug Reports**: Create an issue in the repository (internal team only)
- **Feature Requests**: Submit via project management system

---

**Built with ❤️ for Pakistan-based businesses**

*Current Version: 1.0.0*
