// ========== backend/server-bundle.js ==========
const path = require('path');
const fs = require('fs');

// Configure environment variables for bundled app
// In production, .env is in the same directory as the executable or resources
const isDev = process.env.NODE_ENV === 'development';

if (!isDev) {
    // In production, resources are in process.resourcesPath
    // But this script runs in a child process, so we need to find the right path
    const envPath = path.join(__dirname, '.env');

    if (fs.existsSync(envPath)) {
        require('dotenv').config({ path: envPath });
        console.log(`Loaded environment from ${envPath}`);
    } else {
        // Fallback to parent directory (common in some structures)
        const parentEnvPath = path.join(__dirname, '..', '.env');
        if (fs.existsSync(parentEnvPath)) {
            require('dotenv').config({ path: parentEnvPath });
            console.log(`Loaded environment from ${parentEnvPath}`);
        } else {
            console.warn('⚠️ No .env file found in bundle paths');
        }
    }
} else {
    require('dotenv').config();
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const db = require('./src/config/database');
const logger = require('./src/config/logger');
const { notFound, errorHandler } = require('./src/middleware/errorHandler');
const decimalSerializer = require('./src/middleware/decimalSerializer');

// Import routes
const authRoutes = require('./src/routes/authRoutes');
const userRoutes = require('./src/routes/userRoutes');
const roleRoutes = require('./src/routes/roleRoutes');
const inventoryRoutes = require('./src/routes/inventoryRoutes');
const financeRoutes = require('./src/routes/financeRoutes');
const reportRoutes = require('./src/routes/reportRoutes');
const importExportRoutes = require('./src/routes/importExportRoutes');
const settingsRoutes = require('./src/routes/settingsRoutes');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(cors({
    origin: ['http://localhost:3000', 'file://'], // Allow Electron file protocol
    credentials: true
}));

// Rate limiting - less strict for desktop app
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Higher limit for desktop usage
    message: 'Too many requests'
});
app.use('/api/', limiter);

// Body parser
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Decimal serialization
app.use(decimalSerializer);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/import', importExportRoutes);
app.use('/api/settings', settingsRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'Server is running',
        timestamp: new Date().toISOString()
    });
});

// Shutdown endpoint for Electron
app.post('/api/shutdown', async (req, res) => {
    res.json({ success: true, message: 'Shutting down...' });
    logger.info('Shutdown requested via API');

    // Give time for response to be sent
    setTimeout(async () => {
        await db.disconnect();
        process.exit(0);
    }, 500);
});

// Error handling
app.use(notFound);
app.use(errorHandler);

// Start server
const startServer = async () => {
    try {
        // Connect to database
        await db.connect();

        app.listen(PORT, () => {
            console.log(`🚀 Bundled Server running on port ${PORT}`);
            logger.info(`🚀 Bundled Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
};

// Graceful shutdown handlers
process.on('SIGINT', async () => {
    await db.disconnect();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await db.disconnect();
    process.exit(0);
});

startServer();
