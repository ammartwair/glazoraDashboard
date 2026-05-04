// ============================================
// GLAZORA – Auth Middleware (JWT)
// ============================================
'use strict';

const jwt = require('jsonwebtoken');
const db  = require('../config/database');

// ── Client JWT guard ──────────────────────────
async function requireClient(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) return res.status(401).json({ success: false, message: 'Authentication required' });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role !== 'client') {
      return res.status(403).json({ success: false, message: 'Client access required' });
    }

    const { rows } = await db.query(
      'SELECT id, name, email, phone, preferred_lang FROM clients WHERE id = $1 AND is_active = true',
      [payload.sub]
    );
    if (!rows.length) return res.status(401).json({ success: false, message: 'Account not found' });

    req.client = rows[0];
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

// ── Admin JWT guard ───────────────────────────
async function requireAdmin(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) return res.status(401).json({ success: false, message: 'Admin authentication required' });

    const payload = jwt.verify(token, process.env.JWT_ADMIN_SECRET || process.env.JWT_SECRET);
    if (!['admin', 'superadmin'].includes(payload.role)) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { rows } = await db.query(
      'SELECT id, name, email, role FROM admins WHERE id = $1 AND is_active = true',
      [payload.sub]
    );
    if (!rows.length) return res.status(401).json({ success: false, message: 'Admin account not found' });

    req.admin = rows[0];
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired admin token' });
  }
}

// ── Optional client auth (for public+private routes) ──
async function optionalClient(req, res, next) {
  try {
    const token = extractToken(req);
    if (token) {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const { rows } = await db.query(
        'SELECT id, name, email, phone, preferred_lang FROM clients WHERE id = $1',
        [payload.sub]
      );
      if (rows.length) req.client = rows[0];
    }
  } catch (_) { /* no-op */ }
  next();
}

function extractToken(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

module.exports = { requireClient, requireAdmin, optionalClient };
