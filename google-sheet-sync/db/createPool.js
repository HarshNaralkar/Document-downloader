const mysql = require('mysql2/promise');
const { loadSyncConfig } = require('../config/syncConfig');

function q(identifier) {
    if (!/^[a-zA-Z0-9_]+$/.test(identifier)) {
        throw new Error(`Unsafe MySQL identifier: ${identifier}`);
    }
    return `\`${identifier}\``;
}

function baseConnectionOptions(config) {
    return {
        host: config.mysql.host,
        port: config.mysql.port,
        user: config.mysql.user,
        password: config.mysql.password
    };
}

async function ensureDatabaseFromEnv(env = process.env) {
    const config = loadSyncConfig(env);
    if (!config.mysql.database) {
        throw new Error('MYSQL_DB is required');
    }

    const connection = await mysql.createConnection(baseConnectionOptions(config));
    try {
        await connection.query(
            `CREATE DATABASE IF NOT EXISTS ${q(config.mysql.database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
        );
    } finally {
        await connection.end();
    }

    return config.mysql.database;
}

function createPoolFromEnv(env = process.env) {
    const config = loadSyncConfig(env);

    return mysql.createPool({
        ...baseConnectionOptions(config),
        database: config.mysql.database,
        waitForConnections: true,
        connectionLimit: config.mysql.connectionLimit,
        queueLimit: 0
    });
}

async function createReadyPoolFromEnv(env = process.env) {
    await ensureDatabaseFromEnv(env);
    return createPoolFromEnv(env);
}

module.exports = {
    createPoolFromEnv,
    createReadyPoolFromEnv,
    ensureDatabaseFromEnv
};