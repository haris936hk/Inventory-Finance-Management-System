// ========== electron/backend-manager.js ==========
const { spawn } = require('child_process');
const path = require('path');
const net = require('net');
const { app } = require('electron');

class BackendManager {
    constructor() {
        this.backendProcess = null;
        this.backendPort = 3001;
        this.maxRetries = 30;
        this.retryDelay = 1000; // 1 second
    }

    /**
     * Get the path to the backend server
     */
    getBackendPath() {
        if (process.env.NODE_ENV === 'development' || process.env.ELECTRON_IS_DEV === '1') {
            // Development: backend is in adjacent directory
            return path.join(__dirname, '..', '..', 'backend');
        } else {
            // Production: backend is bundled in resources
            return path.join(process.resourcesPath, 'backend');
        }
    }

    /**
     * Check if a port is available
     */
    checkPort(port) {
        return new Promise((resolve) => {
            const server = net.createServer();

            server.once('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    resolve(false); // Port is in use
                } else {
                    resolve(false);
                }
            });

            server.once('listening', () => {
                server.close();
                resolve(true); // Port is available
            });

            server.listen(port, '127.0.0.1');
        });
    }

    /**
     * Wait for backend server to be ready
     */
    async waitForBackend(retries = this.maxRetries) {
        for (let i = 0; i < retries; i++) {
            const isPortInUse = !(await this.checkPort(this.backendPort));

            if (isPortInUse) {
                console.log(`✅ Backend server is ready on port ${this.backendPort}`);
                return true;
            }

            console.log(`⏳ Waiting for backend server... (${i + 1}/${retries})`);
            await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        }

        console.error(`❌ Backend server failed to start after ${retries} attempts`);
        return false;
    }

    /**
     * Start the backend Node.js server
     */
    async start() {
        try {
            const backendPath = this.getBackendPath();
            const isDev = process.env.NODE_ENV === 'development' || process.env.ELECTRON_IS_DEV === '1';

            // Always use src/server.js (no bundling)
            const serverScript = path.join(backendPath, 'src', 'server.js');

            console.log('🚀 Starting backend server...');
            console.log('📁 Backend path:', backendPath);
            console.log('📄 Server script:', serverScript);
            console.log('🔧 Environment:', isDev ? 'development' : 'production');

            // Verify backend files exist
            const fs = require('fs');
            if (!fs.existsSync(backendPath)) {
                throw new Error(`Backend directory not found: ${backendPath}`);
            }
            if (!fs.existsSync(serverScript)) {
                throw new Error(`Server script not found: ${serverScript}`);
            }

            // Check for .env file
            const envPath = path.join(backendPath, '.env');
            if (!fs.existsSync(envPath)) {
                console.warn('⚠️ Warning: .env file not found at', envPath);
            } else {
                console.log('✅ .env file found');
            }

            // Check if port is already in use
            const portAvailable = await this.checkPort(this.backendPort);
            if (!portAvailable) {
                console.warn(`⚠️ Port ${this.backendPort} is already in use - backend may already be running`);
                return { success: true, alreadyRunning: true };
            }

            // Spawn the backend process
            this.backendProcess = spawn('node', [serverScript], {
                cwd: backendPath,
                env: {
                    ...process.env,
                    NODE_ENV: 'production',
                    PORT: this.backendPort.toString()
                },
                stdio: ['ignore', 'pipe', 'pipe']
            });

            // Log backend output
            this.backendProcess.stdout.on('data', (data) => {
                console.log(`[Backend] ${data.toString().trim()}`);
            });

            this.backendProcess.stderr.on('data', (data) => {
                console.error(`[Backend Error] ${data.toString().trim()}`);
            });

            this.backendProcess.on('error', (error) => {
                console.error('❌ Failed to start backend process:', error);
            });

            this.backendProcess.on('exit', (code, signal) => {
                console.log(`Backend process exited with code ${code} and signal ${signal}`);
                this.backendProcess = null;
            });

            // Wait for backend to be ready
            const isReady = await this.waitForBackend();

            if (isReady) {
                console.log('✅ Backend server started successfully');
                return { success: true, alreadyRunning: false };
            } else {
                throw new Error('Backend server failed to become ready');
            }

        } catch (error) {
            console.error('❌ Error starting backend:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Stop the backend server gracefully
     */
    async stop() {
        if (!this.backendProcess) {
            console.log('No backend process to stop');
            return;
        }

        console.log('🛑 Stopping backend server...');

        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                console.log('⚠️ Backend did not stop gracefully, forcing kill...');
                if (this.backendProcess) {
                    this.backendProcess.kill('SIGKILL');
                }
                resolve();
            }, 5000); // 5 second timeout

            this.backendProcess.once('exit', () => {
                clearTimeout(timeout);
                console.log('✅ Backend server stopped');
                this.backendProcess = null;
                resolve();
            });

            // Try graceful shutdown
            this.backendProcess.kill('SIGTERM');
        });
    }

    /**
     * Get backend URL
     */
    getBackendUrl() {
        return `http://localhost:${this.backendPort}`;
    }
}

module.exports = new BackendManager();
