// ============================================
// GLAZORA – Quotations Routes
// ============================================
'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../config/database');
const { requireAdmin } = require('../middleware/auth');

router.use(requireAdmin);

// GET /api/quotations?project_id=xxx
router.get('/', async (req, res) => {
  try {
    const { project_id } = req.query;
    let sql = `SELECT q.*, p.project_number FROM quotations q JOIN projects p ON p.id = q.project_id`;
    const params = [];
    if (project_id) { params.push(project_id); sql += ` WHERE q.project_id = $1`; }
    sql += ' ORDER BY q.created_at DESC';
    const { rows } = await db.query(sql, params);
    res.json({ success: true, quotations: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/quotations
router.post('/', async (req, res) => {
  try {
    const { project_id, quotation_number, items = [], vat_pct = 5, notes_ar, notes_en, valid_until } = req.body;
    if (!project_id || !quotation_number) {
      return res.status(400).json({ success: false, message: 'project_id and quotation_number required' });
    }

    const subtotal = items.reduce((sum, i) => sum + (parseFloat(i.quantity) * parseFloat(i.unit_price)), 0);
    const vat_amount = subtotal * (parseFloat(vat_pct) / 100);
    const total = subtotal + vat_amount;

    const { rows: [quot] } = await db.query(
      `INSERT INTO quotations (project_id, quotation_number, subtotal, vat_pct, vat_amount, total, notes_ar, notes_en, valid_until, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [project_id, quotation_number, subtotal, vat_pct, vat_amount, total, notes_ar, notes_en, valid_until, req.admin.id]
    );

    // Insert line items
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      await db.query(
        `INSERT INTO quotation_items (quotation_id, sort_order, description_ar, description_en, unit_ar, unit_en, quantity, unit_price)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [quot.id, i + 1, it.description_ar, it.description_en, it.unit_ar, it.unit_en, it.quantity, it.unit_price]
      );
    }

    res.status(201).json({ success: true, quotation: quot });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ success: false, message: 'Quotation number already exists' });
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/quotations/:id (with items)
router.get('/:id', async (req, res) => {
  try {
    const { rows: [quot] } = await db.query('SELECT * FROM quotations WHERE id = $1', [req.params.id]);
    if (!quot) return res.status(404).json({ success: false, message: 'Quotation not found' });
    const { rows: items } = await db.query(
      'SELECT * FROM quotation_items WHERE quotation_id = $1 ORDER BY sort_order',
      [req.params.id]
    );
    res.json({ success: true, quotation: { ...quot, items } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/quotations/:id/status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const { rows } = await db.query(
      'UPDATE quotations SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    res.json({ success: true, quotation: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

// ============================================
// GLAZORA – Public Projects Route (contact form)
// ============================================
const contactRouter = express.Router();

// POST /api/projects/contact (public — no auth)
contactRouter.post('/contact', async (req, res) => {
  try {
    const { first_name, last_name, phone, email, project_type, emirate, message } = req.body;
    if (!phone && !email) {
      return res.status(400).json({ success: false, message: 'Phone or email is required' });
    }
    await db.query(
      `INSERT INTO contact_submissions (first_name, last_name, phone, email, project_type, emirate, message)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [first_name, last_name, phone, email, project_type, emirate, message]
    );
    res.status(201).json({
      success: true,
      message: 'Your message has been received. We will contact you within 24 hours.'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports.contactRouter = contactRouter;
