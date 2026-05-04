// ============================================
// GLAZORA – Database Configuration (PostgreSQL)
// ============================================
'use strict';

const { Pool } = require('pg');

const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production'
          ? { rejectUnauthorized: false }
          : false
      }
    : {
        host:     process.env.DB_HOST     || 'localhost',
        port:     parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME     || 'glazora_db',
        user:     process.env.DB_USER     || 'glazora_user',
        password: process.env.DB_PASSWORD || '',
        max: 20,                  // max pool connections
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      }
);

pool.on('connect', () => {
  if (process.env.NODE_ENV !== 'test') {
    console.log('✅ PostgreSQL connected');
  }
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL pool error:', err.message);
});

// Helper: run a query with optional values
const query = (text, params) => pool.query(text, params);

// Helper: get a client for transactions
const getClient = () => pool.connect();

module.exports = { query, getClient, pool };
