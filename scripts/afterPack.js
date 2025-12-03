// AfterPack hook for electron-builder
// Verifies that the backend is properly packaged

const path = require('path');
const fs = require('fs');

exports.default = async function(context) {
    const appOutDir = context.appOutDir;
    const resourcesPath = path.join(appOutDir, 'resources');
    const backendPath = path.join(resourcesPath, 'backend');

    console.log('\n🔍 Verifying packaged backend...');
    console.log('📁 App output directory:', appOutDir);
    console.log('📁 Resources path:', resourcesPath);
    console.log('📁 Backend path:', backendPath);

    // Check if backend directory exists
    if (!fs.existsSync(backendPath)) {
        throw new Error('❌ Backend directory not found in packaged app!');
    }
    console.log('✅ Backend directory found');

    // Check critical files
    const criticalFiles = [
        'src/server.js',
        'package.json',
        '.env',
        'prisma/schema.prisma'
    ];

    for (const file of criticalFiles) {
        const filePath = path.join(backendPath, file);
        if (!fs.existsSync(filePath)) {
            console.warn(`⚠️  Warning: ${file} not found`);
        } else {
            console.log(`✅ ${file} found`);
        }
    }

    // Check node_modules
    const nodeModulesPath = path.join(backendPath, 'node_modules');
    if (!fs.existsSync(nodeModulesPath)) {
        console.warn('⚠️  Warning: node_modules not found in backend');
    } else {
        console.log('✅ node_modules found');

        // Check for critical dependencies
        const criticalDeps = [
            '@prisma/client',
            'express',
            'dotenv'
        ];

        for (const dep of criticalDeps) {
            const depPath = path.join(nodeModulesPath, dep);
            if (!fs.existsSync(depPath)) {
                console.warn(`⚠️  Warning: ${dep} not found in node_modules`);
            } else {
                console.log(`✅ ${dep} found`);
            }
        }
    }

    console.log('✅ Backend verification complete!\n');
};
