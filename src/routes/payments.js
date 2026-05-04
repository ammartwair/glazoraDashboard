// ============================================
// GLAZORA – Payments Routes
// ============================================
'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../config/database');
const { requireAdmin } = require('../middleware/auth');

router.use(requireAdmin);

// GET /api/payments?project_id=xxx
router.get('/', async (req, res) => {
  try {
    const { project_id } = req.query;
    let sql = 'SELECT * FROM payments';
    const params = [];
    if (project_id) { params.push(project_id); sql += ` WHERE project_id = $1`; }
    sql += ' ORDER BY created_at';
    const { rows } = await db.query(sql, params);
    res.json({ success: true, payments: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/payments
router.post('/', async (req, res) => {
  try {
    const {
      project_id, milestone_name_ar, milestone_name_en,
      amount, pct_of_total, status, due_date
    } = req.body;
    if (!project_id || !amount) {
      return res.status(400).json({ success: false, message: 'project_id and amount required' });
    }
    const { rows } = await db.query(
      `INSERT INTO payments (project_id, milestone_name_ar, milestone_name_en, amount, pct_of_total, status, due_date, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [project_id, milestone_name_ar, milestone_name_en, amount, pct_of_total, status || 'pending', due_date, req.admin.id]
    );
    res.status(201).json({ success: true, payment: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/payments/:id  (mark as paid)
router.patch('/:id', async (req, res) => {
  try {
    const { status, payment_method, reference_no, paid_at, notes } = req.body;
    const paidAt = status === 'paid' ? (paid_at || new Date().toISOString()) : null;

    const { rows } = await db.query(
      `UPDATE payments SET
         status = COALESCE($1, status),
         payment_method = COALESCE($2, payment_method),
         reference_no = COALESCE($3, reference_no),
         paid_at = COALESCE($4, paid_at),
         notes = COALESCE($5, notes),
         updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [status, payment_method, reference_no, paidAt, notes, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Payment not found' });

    // Log update
    if (status === 'paid') {
      await db.query(
        `INSERT INTO project_updates (project_id, type, message_ar, message_en, created_by)
         VALUES ($1, 'payment', $2, $3, $4)`,
        [rows[0].project_id,
         `تم تسجيل دفعة بقيمة ${rows[0].amount} درهم`,
         `Payment of AED ${rows[0].amount} recorded`,
         req.admin.id]
      );
    }

    res.json({ success: true, payment: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/payments/:id
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await db.query('DELETE FROM payments WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Payment not found' });
    res.json({ success: true, message: 'Payment deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
