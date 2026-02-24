const { spawn } = require('child_process');

console.log('🚀 Starting Jharkhand Chhatriya Sangh Bhawan Backend...\n');

// Kill any process on port 5000 first
const killPort = spawn('npx', ['kill-port', '5000'], { shell: true });

killPort.on('close', (code) => {
    console.log('📝 Port 5000 cleared\n');
    
    // Start the server
    const server = spawn('node', ['src/server.js'], { 
        stdio: 'inherit',
        shell: true 
    });

    server.on('error', (error) => {
        console.error('❌ Failed to start server:', error);
    });

    server.on('close', (code) => {
        console.log(`\n🔚 Server process exited with code ${code}`);
    });
});

// Handle Ctrl+C
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down server...');
    process.exit(0);
});
