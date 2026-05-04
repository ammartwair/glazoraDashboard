// ============================================
// GLAZORA BACKEND – server.js (Entry Point)
// ============================================
'use strict';

require('dotenv').config();
const express     = require('express');
const helmet      = require('helmet');
const cors        = require('cors');
const path        = require('path');
const rateLimit   = require('express-rate-limit');

const db          = require('./config/database');
const authRoutes  = require('./routes/auth');
const clientRoutes= require('./routes/client');
const adminRoutes = require('./routes/admin');
const projectRoutes = require('./routes/projects');
const photoRoutes = require('./routes/photos');
const paymentRoutes = require('./routes/payments');
const quotationRoutes = require('./routes/quotations');

const app = express();
const PORT = process.env.PORT || 5000;

// ── Security headers ──────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// ── CORS ──────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  // Add your production domain here
  'https://glazora.ae',
  'https://www.glazora.ae'
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin ${origin} not allowed`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept-Language']
}));

// ── Body parsers ──────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Static files (uploaded photos) ───────────
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ── Global rate limiter ───────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' }
});
app.use('/api', globalLimiter);

// ── Health check ──────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ success: true, message: 'Glazora API is running', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Database connection failed' });
  }
});

// ── API Routes ────────────────────────────────
app.use('/api/auth',        authRoutes);
app.use('/api/client',      clientRoutes);
app.use('/api/admin',       adminRoutes);
app.use('/api/projects',    projectRoutes);
app.use('/api/photos',      photoRoutes);
app.use('/api/payments',    paymentRoutes);
app.use('/api/quotations',  quotationRoutes);

// ── 404 handler ───────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ── Global error handler ──────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message);
  if (process.env.NODE_ENV === 'development') console.error(err.stack);

  if (err.message && err.message.startsWith('CORS')) {
    return res.status(403).json({ success: false, message: err.message });
  }
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred'
      : err.message
  });
});

// ── Start server ──────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║        GLAZORA API SERVER            ║');
  console.log('╠══════════════════════════════════════╣');
  console.log(`║  Port    : ${PORT}                       ║`);
  console.log(`║  Mode    : ${process.env.NODE_ENV || 'development'}              ║`);
  console.log('╚══════════════════════════════════════╝');
  console.log('');
});

module.exports = app;
