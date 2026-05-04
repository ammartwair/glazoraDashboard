// ============================================
// GLAZORA – Client Routes (Protected)
// All routes require valid client JWT
// ============================================
'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../config/database');
const { requireClient } = require('../middleware/auth');

// All client routes are protected
router.use(requireClient);

// ─────────────────────────────────────────────
// GET /api/client/profile
// ─────────────────────────────────────────────
router.get('/profile', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, name, email, phone, preferred_lang, created_at FROM clients WHERE id = $1',
      [req.client.id]
    );
    res.json({ success: true, client: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/client/profile
router.patch('/profile', async (req, res) => {
  try {
    const { name, preferred_lang } = req.body;
    const { rows } = await db.query(
      `UPDATE clients SET
         name = COALESCE($1, name),
         preferred_lang = COALESCE($2, preferred_lang),
         updated_at = NOW()
       WHERE id = $3 RETURNING id, name, email, phone, preferred_lang`,
      [name, preferred_lang, req.client.id]
    );
    res.json({ success: true, client: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────
// GET /api/client/projects
// Returns all projects linked to this client
// ─────────────────────────────────────────────
router.get('/projects', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT
         p.id, p.project_number,
         p.title_ar, p.title_en,
         p.description_ar, p.description_en,
         p.location_ar, p.location_en,
         p.project_type, p.status,
         p.current_phase, p.total_phases, p.completion_pct,
         p.start_date, p.expected_end_date, p.actual_end_date,
         p.supervisor_name,
         cp.connected_at
       FROM client_projects cp
       JOIN projects p ON p.id = cp.project_id
       WHERE cp.client_id = $1
       ORDER BY cp.connected_at DESC`,
      [req.client.id]
    );
    res.json({ success: true, projects: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────
// GET /api/client/projects/:projectId/dashboard
// Full dashboard data in one request
// ─────────────────────────────────────────────
router.get('/projects/:projectId/dashboard', async (req, res) => {
  try {
    const { projectId } = req.params;

    // Verify client has access to this project
    const access = await db.query(
      `SELECT 1 FROM client_projects WHERE client_id = $1 AND project_id = $2`,
      [req.client.id, projectId]
    );
    if (!access.rows.length) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Project details
    const { rows: [project] } = await db.query(
      `SELECT * FROM projects WHERE id = $1`, [projectId]
    );

    // Phases
    const { rows: phases } = await db.query(
      `SELECT * FROM project_phases WHERE project_id = $1 ORDER BY phase_number`,
      [projectId]
    );

    // Photos grouped by phase
    const { rows: photos } = await db.query(
      `SELECT id, phase, filename, caption_ar, caption_en, created_at
       FROM photos WHERE project_id = $1 ORDER BY created_at DESC`,
      [projectId]
    );

    // Quotation with items
    const { rows: quotations } = await db.query(
      `SELECT q.*, json_agg(
         json_build_object(
           'id', qi.id, 'sort_order', qi.sort_order,
           'description_ar', qi.description_ar, 'description_en', qi.description_en,
           'unit_ar', qi.unit_ar, 'unit_en', qi.unit_en,
           'quantity', qi.quantity, 'unit_price', qi.unit_price, 'total_price', qi.total_price
         ) ORDER BY qi.sort_order
       ) AS items
       FROM quotations q
       LEFT JOIN quotation_items qi ON qi.quotation_id = q.id
       WHERE q.project_id = $1
       GROUP BY q.id
       ORDER BY q.created_at DESC LIMIT 1`,
      [projectId]
    );

    // Payments
    const { rows: payments } = await db.query(
      `SELECT * FROM payments WHERE project_id = $1 ORDER BY created_at`,
      [projectId]
    );

    // Payment summary
    const totalAmount = payments.reduce((s, p) => s + parseFloat(p.amount), 0);
    const paidAmount  = payments.filter(p => p.status === 'paid').reduce((s, p) => s + parseFloat(p.amount), 0);

    // Recent updates
    const { rows: updates } = await db.query(
      `SELECT * FROM project_updates WHERE project_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [projectId]
    );

    res.json({
      success: true,
      dashboard: {
        project,
        phases,
        photos: {
          before: photos.filter(p => p.phase === 'before'),
          during: photos.filter(p => p.phase === 'during'),
          after:  photos.filter(p => p.phase === 'after'),
        },
        quotation: quotations[0] || null,
        payments,
        paymentSummary: {
          total: totalAmount,
          paid: paidAmount,
          remaining: totalAmount - paidAmount,
          paidPct: totalAmount ? Math.round((paidAmount / totalAmount) * 100) : 0
        },
        updates
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────
// POST /api/client/projects/:projectId/quotation/approve
// ─────────────────────────────────────────────
router.post('/projects/:projectId/quotation/approve', async (req, res) => {
  try {
    const { projectId } = req.params;

    const access = await db.query(
      'SELECT 1 FROM client_projects WHERE client_id = $1 AND project_id = $2',
      [req.client.id, projectId]
    );
    if (!access.rows.length) return res.status(403).json({ success: false, message: 'Access denied' });

    const { rows } = await db.query(
      `UPDATE quotations SET approved_by_client = true, approved_at = NOW(), status = 'approved'
       WHERE project_id = $1 AND approved_by_client = false
       RETURNING id, quotation_number`,
      [projectId]
    );

    if (!rows.length) return res.status(400).json({ success: false, message: 'Quotation already approved or not found' });

    res.json({ success: true, message: 'Quotation approved', quotation: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
