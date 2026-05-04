// ============================================
// GLAZORA – Projects Public Route
// ============================================
'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../config/database');

// POST /api/projects/contact  (public contact form)
router.post('/contact', async (req, res) => {
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
    res.status(201).json({ success: true, message: 'Message received. We will contact you within 24 hours.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
