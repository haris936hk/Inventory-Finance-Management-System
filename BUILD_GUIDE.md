# Electron App Build & Packaging Guide

This guide explains how to build and package the Inventory Finance Management System as a Windows desktop application.

## Prerequisites

- Node.js (v16 or higher)
- npm (v8 or higher)
- Windows OS (for building Windows installer)

## Project Structure

```
Inventory-Finance-Management-System/
├── backend/                 # Node.js/Express backend
│   ├── src/
│   │   └── server.js       # Backend entry point
│   ├── prisma/
│   ├── .env                # Backend environment variables (IMPORTANT!)
│   └── package.json
├── frontend/               # React frontend + Electron
│   ├── src/
│   ├── build/             # React production build (generated)
│   ├── electron/
│   │   ├── main.js        # Electron main process
│   │   └── backend-manager.js  # Backend lifecycle manager
│   └── package.json
├── electron-builder.yml   # Electron builder configuration
├── package.json           # Root build scripts
└── dist/                  # Built installers (generated)
```

## How It Works

### Development Mode
- Frontend runs on `http://localhost:3000` (React dev server)
- Backend runs on `http://localhost:3001` (Node.js)
- Electron loads the React dev server

### Production Mode (Packaged App)
- Frontend is built into static files (`frontend/build/`)
- Backend is copied to `resources/backend/` in the packaged app
- Electron loads static files and spawns backend process
- Backend runs on `http://localhost:3001`

## Building the Application

### Step 1: Install Dependencies

```bash
# Install all dependencies (frontend + backend + root)
npm install
```

This will run the `postinstall` script that installs dependencies for both frontend and backend.

### Step 2: Build Frontend

```bash
npm run build:frontend
```

This creates optimized React production build in `frontend/build/`

### Step 3: Prepare Backend

```bash
npm run build:backend
```

This:
1. Installs only production dependencies (`--omit=dev`)
2. Generates Prisma Client for the current platform

### Step 4: Build Everything

```bash
# Build both frontend and backend
npm run build:all
```

### Step 5: Package the Application

**For testing (unpacked):**
```bash
npm run pack
```
This creates an unpacked app in `dist/win-unpacked/` that you can run directly without installation.

**For distribution (installer):**
```bash
npm run dist
# Or specifically for Windows:
npm run dist:win
```
This creates a Windows installer in `dist/` directory.

## Testing the Packaged App

### Running Unpacked App

After running `npm run pack`:

```bash
# Navigate to the unpacked app and run it
cd dist/win-unpacked
"Inventory Finance Management System.exe"
```

**What to check:**
1. Console logs (press F12 in the app to open DevTools)
2. Backend startup messages
3. Database connection
4. API calls working

### Common Issues & Solutions

#### Issue 1: "Backend cannot be started"

**Symptoms:**
- Error dialog on app startup
- Console shows "Backend directory not found" or "Server script not found"

**Solutions:**
1. Check if backend files are in the right location:
   ```bash
   # In dist/win-unpacked/
   dir resources\backend
   # Should show: src/, prisma/, node_modules/, .env, package.json
   ```

2. Check if `.env` file exists:
   ```bash
   type resources\backend\.env
   ```

3. Run the verification script manually:
   ```bash
   node scripts/afterPack.js
   ```

#### Issue 2: "Database connection failed"

**Symptoms:**
- Backend starts but can't connect to database
- Error about DATABASE_URL

**Solutions:**
1. Verify `.env` file is copied to packaged app
2. Check DATABASE_URL in `.env` is correct
3. Ensure you have internet connection (for Supabase)

#### Issue 3: "Prisma Client not generated"

**Symptoms:**
- Error: "Cannot find module '@prisma/client'"

**Solutions:**
1. Run Prisma generation manually:
   ```bash
   cd backend
   npx prisma generate
   ```

2. Rebuild backend:
   ```bash
   npm run build:backend
   ```

#### Issue 4: "Port 3001 already in use"

**Symptoms:**
- Backend won't start, port in use error

**Solutions:**
1. Kill existing backend process:
   ```bash
   # Windows
   netstat -ano | findstr :3001
   taskkill /PID <PID> /F
   ```

2. Change backend port in `backend/.env`:
   ```
   PORT=3002
   ```

#### Issue 5: Missing dependencies in packaged app

**Symptoms:**
- Error: "Cannot find module 'express'" (or other dependencies)

**Solutions:**
1. Ensure `backend/node_modules` is being copied
2. Check `electron-builder.yml` includes node_modules:
   ```yaml
   extraResources:
     - from: backend/node_modules
       to: backend/node_modules
   ```

3. Reinstall backend dependencies:
   ```bash
   cd backend
   rm -rf node_modules
   npm install --omit=dev
   ```

## Build Configuration Files

### electron-builder.yml

Key sections:
- `files`: What gets included in the app package
- `extraResources`: Backend files copied to resources folder
- `afterPack`: Verification script run after packaging

### package.json (root)

Build scripts:
- `build:frontend` - Build React app
- `build:backend` - Prepare backend (install deps + Prisma)
- `build:all` - Build everything
- `pack` - Create unpacked app
- `dist` - Create installer

### frontend/electron/backend-manager.js

Manages backend lifecycle:
- Determines backend path (dev vs production)
- Spawns Node.js process for backend
- Monitors backend health
- Stops backend on app quit

## Debugging Tips

### Enable Verbose Logging

1. Open `frontend/electron/main.js` and ensure DevTools opens in production:
   ```javascript
   // Add this after window creation
   mainWindow.webContents.openDevTools();
   ```

2. Check backend logs in console output

### Verify Backend Files

Run this in PowerShell from `dist/win-unpacked/`:

```powershell
# Check if backend exists
Test-Path "resources\backend"

# Check critical files
Test-Path "resources\backend\src\server.js"
Test-Path "resources\backend\.env"
Test-Path "resources\backend\node_modules"

# List backend contents
dir resources\backend
```

### Test Backend Separately

Navigate to the packaged backend and run it manually:

```bash
cd dist/win-unpacked/resources/backend
node src/server.js
```

If this works, the issue is with Electron's backend manager.

## Production Checklist

Before creating a distributable installer:

- [ ] All environment variables in `backend/.env` are correct
- [ ] Database is accessible from the target environment
- [ ] Frontend build works: `npm run build:frontend`
- [ ] Backend dependencies installed: `npm run build:backend`
- [ ] Prisma client generated
- [ ] Unpacked app tested: `npm run pack` and test
- [ ] All features work in unpacked app
- [ ] Backend starts successfully
- [ ] Database operations work
- [ ] No console errors

Then build the installer:
```bash
npm run dist:win
```

## File Size Optimization

The packaged app will be large (~200-300MB) due to:
- Node.js backend + dependencies
- Electron runtime
- React build
- Database client (Prisma)

To reduce size:
1. Remove unused dependencies
2. Use `--omit=dev` for backend dependencies
3. Enable compression in electron-builder.yml:
   ```yaml
   win:
     target:
       - target: nsis
         arch:
           - x64
     compression: maximum
   ```

## Security Notes

**IMPORTANT:**
- The `.env` file contains database credentials
- Do not distribute installers publicly if they contain sensitive credentials
- Consider using environment-specific builds:
  - Development build with dev database
  - Production build with production database
- For multi-tenant distribution, implement credential input in the app

## Getting Help

If you encounter issues:

1. Check console logs (F12 in app)
2. Review `logs/error.log` in backend folder
3. Run verification script: `node scripts/afterPack.js`
4. Test backend separately
5. Check this guide's troubleshooting section

## Advanced: Custom Build Scripts

### Creating a One-Click Build Script

Create `build.bat` for Windows:

```batch
@echo off
echo Building Inventory Finance Management System...
echo.

echo [1/4] Cleaning previous builds...
rmdir /s /q dist
rmdir /s /q frontend\build

echo [2/4] Building frontend...
call npm run build:frontend
if errorlevel 1 goto error

echo [3/4] Preparing backend...
call npm run build:backend
if errorlevel 1 goto error

echo [4/4] Packaging application...
call npm run dist:win
if errorlevel 1 goto error

echo.
echo ✅ Build complete! Installer in dist\ folder
goto end

:error
echo ❌ Build failed!
pause

:end
```

Run with: `build.bat`

## Version Management

Update version in three places:
1. `package.json` (root) - App version
2. `frontend/package.json` - Frontend version
3. `backend/package.json` - Backend version

electron-builder reads version from root `package.json`.
