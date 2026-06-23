module.exports = {
    apps: [{
        name: 'docgen',
        script: 'app.js',
        cwd: '/var/www/docgen',

        // Run in fork mode (single process) — required for the in-memory PDF queue
        // Do NOT use cluster_mode: it would give each worker its own queue, breaking concurrency protection
        instances: 1,
        exec_mode: 'fork',

        // Auto restart on crash
        autorestart: true,
        watch: false,

        // Restart if memory exceeds 1.5GB (safety valve on 4GB VPS)
        max_memory_restart: '1500M',

        // Restart delay
        restart_delay: 2000,

        // Environment variables for production
        env: {
            NODE_ENV: 'production',
            PORT: 5100   // Unique port — avoids conflicts with other apps on the same VPS
        },

        // Logging
        out_file: './logs/out.log',
        error_file: './logs/error.log',
        log_date_format: 'YYYY-MM-DD HH:mm:ss',
        merge_logs: true
    }]
};
