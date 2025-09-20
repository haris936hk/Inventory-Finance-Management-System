# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Inventory & Finance Management System designed for automating inventory control operations, streamlining financial processes, managing customer and vendor accounts, and providing comprehensive reporting capabilities. The system is built as an Electron desktop application with a React frontend and Node.js/Express backend.

## Architecture

### Full Stack Structure
- **Frontend**: React 18 with Ant Design UI components, running in Electron for desktop app distribution
- **Backend**: Node.js with Express.js REST API
- **Database**: PostgreSQL via Supabase with Prisma ORM
- **State Management**: Zustand for React state management
- **Authentication**: JWT-based authentication with role-based access control

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

### Key Features
- Serial number based inventory tracking
- Barcode scanning support (via @ericblade/quagga2)
- Status history tracking for items
- Comprehensive financial reporting
- Role-based access control
- Import/Export functionality for Excel files

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

## Technology Stack

### Frontend Dependencies
- React 18 with React Router for navigation
- Ant Design for UI components
- Axios for HTTP requests
- React Query for server state management
- Zustand for client state management
- Electron for desktop app packaging
- @ericblade/quagga2 for barcode scanning
- Recharts for data visualization

### Backend Dependencies
- Express.js with security middleware (helmet, cors, rate limiting)
- Prisma ORM for database operations
- JWT for authentication
- Winston for logging
- Multer for file uploads
- ExcelJS/XLSX for Excel file processing
- Jest for testing

## Development Notes

- The backend runs on port 3001 by default
- Frontend connects to backend via configured API URL
- Database migrations should be run before starting development
- The system uses UUID primary keys throughout
- All monetary values use Decimal type for precision
- Soft deletes are implemented via `deletedAt` timestamp
- Authentication tokens expire in 24 hours by default