// ============================================
// GLAZORA – Photos Routes
// ============================================
'use strict';

const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');
const db      = require('../config/database');
const { requireAdmin, requireClient } = require('../middleware/auth');

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads/photos'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE_MB || 10) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
  }
});

// ── Admin: Upload photos ──────────────────────
router.post('/upload', requireAdmin, upload.array('photos', 20), async (req, res) => {
  try {
    const { project_id, phase, caption_ar, caption_en } = req.body;
    if (!project_id || !phase) {
      return res.status(400).json({ success: false, message: 'project_id and phase are required' });
    }
    if (!['before', 'during', 'after'].includes(phase)) {
      return res.status(400).json({ success: false, message: 'phase must be before, during, or after' });
    }
    if (!req.files || !req.files.length) {
      return res.status(400).json({ success: false, message: 'No files uploaded' });
    }

    const inserted = [];
    for (const file of req.files) {
      const { rows } = await db.query(
        `INSERT INTO photos (project_id, phase, filename, original_name, caption_ar, caption_en, file_size, mime_type, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [project_id, phase, file.filename, file.originalname,
         caption_ar, caption_en, file.size, file.mimetype, req.admin.id]
      );
      inserted.push(rows[0]);
    }

    // Log update
    await db.query(
      `INSERT INTO project_updates (project_id, type, message_ar, message_en, created_by)
       VALUES ($1, 'photo', $2, $3, $4)`,
      [project_id,
       `تم رفع ${inserted.length} صورة – مرحلة: ${phase}`,
       `${inserted.length} photo(s) uploaded – phase: ${phase}`,
       req.admin.id]
    );

    res.status(201).json({ success: true, photos: inserted });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Admin: Delete photo ───────────────────────
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query('DELETE FROM photos WHERE id = $1 RETURNING *', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Photo not found' });
    // Optionally: delete file from disk
    res.json({ success: true, message: 'Photo deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Admin: Update caption ─────────────────────
router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const { caption_ar, caption_en } = req.body;
    const { rows } = await db.query(
      'UPDATE photos SET caption_ar = $1, caption_en = $2 WHERE id = $3 RETURNING *',
      [caption_ar, caption_en, req.params.id]
    );
    res.json({ success: true, photo: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
