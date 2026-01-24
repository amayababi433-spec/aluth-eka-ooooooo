module.exports = {
    apps: [{
        name: 'dmc-bot',
        script: 'index.js',
        instances: 1, // FORCE 1 instance to prevent session file conflicts (logic protection)
        exec_mode: 'fork',
        env: {
            NODE_ENV: 'production',
            PORT: 8000,
            LOG_LEVEL: 'silent'
        },
        autorestart: true,
        max_restarts: 30,
        min_uptime: '10s',
        restart_delay: 5000 // Fixed delay + PM2 basic backoff 
    }]
};
