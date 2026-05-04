// ============================================
// GLAZORA – Admin Routes (Protected)
// ============================================
'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../config/database');
const { requireAdmin } = require('../middleware/auth');
const { sendProjectConnectedEmail } = require('../utils/email');

router.use(requireAdmin);

// ─────────────────────────────────────────────
// GET /api/admin/dashboard
// ─────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const [projects, clients, payments, unconnected] = await Promise.all([
      db.query(`SELECT
        COUNT(*) FILTER (WHERE status = 'active') AS active,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed,
        COUNT(*) AS total
        FROM projects`),
      db.query(`SELECT COUNT(*) AS total FROM clients`),
      db.query(`SELECT
        COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) AS paid,
        COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0) AS pending
        FROM payments`),
      db.query(`SELECT COUNT(*) AS count FROM clients c
        WHERE NOT EXISTS (SELECT 1 FROM client_projects cp WHERE cp.client_id = c.id)`)
    ]);

    const recentProjects = await db.query(
      `SELECT id, project_number, title_ar, title_en, status, completion_pct, updated_at
       FROM projects ORDER BY updated_at DESC LIMIT 8`
    );

    const recentClients = await db.query(
      `SELECT c.id, c.name, c.email, c.phone, c.created_at,
         (SELECT COUNT(*) FROM client_projects cp WHERE cp.client_id = c.id) AS project_count
       FROM clients c ORDER BY c.created_at DESC LIMIT 6`
    );

    res.json({
      success: true,
      stats: {
        projects: projects.rows[0],
        clients: clients.rows[0],
        payments: payments.rows[0],
        unconnectedClients: parseInt(unconnected.rows[0].count)
      },
      recentProjects: recentProjects.rows,
      recentClients: recentClients.rows
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────
// CLIENTS CRUD
// ─────────────────────────────────────────────
router.get('/clients', async (req, res) => {
  try {
    const { search, connected } = req.query;
    let sql = `
      SELECT c.id, c.name, c.email, c.phone, c.is_active, c.preferred_lang, c.created_at,
        json_agg(json_build_object(
          'project_id', cp.project_id,
          'project_number', p.project_number,
          'title_ar', p.title_ar, 'title_en', p.title_en
        )) FILTER (WHERE cp.project_id IS NOT NULL) AS projects
      FROM clients c
      LEFT JOIN client_projects cp ON cp.client_id = c.id
      LEFT JOIN projects p ON p.id = cp.project_id
    `;
    const params = [];
    const conditions = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(c.name ILIKE $${params.length} OR c.email ILIKE $${params.length} OR c.phone ILIKE $${params.length})`);
    }
    if (connected === 'false') {
      conditions.push('NOT EXISTS (SELECT 1 FROM client_projects cp2 WHERE cp2.client_id = c.id)');
    } else if (connected === 'true') {
      conditions.push('EXISTS (SELECT 1 FROM client_projects cp2 WHERE cp2.client_id = c.id)');
    }

    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' GROUP BY c.id ORDER BY c.created_at DESC';

    const { rows } = await db.query(sql, params);
    res.json({ success: true, clients: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/clients/:id', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT c.*,
        json_agg(json_build_object(
          'project_id', cp.project_id,
          'project_number', p.project_number,
          'title_ar', p.title_ar, 'title_en', p.title_en, 'status', p.status
        )) FILTER (WHERE cp.project_id IS NOT NULL) AS projects
      FROM clients c
      LEFT JOIN client_projects cp ON cp.client_id = c.id
      LEFT JOIN projects p ON p.id = cp.project_id
      WHERE c.id = $1
      GROUP BY c.id
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Client not found' });
    res.json({ success: true, client: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/clients/:id', async (req, res) => {
  try {
    const { name, is_active, preferred_lang } = req.body;
    const { rows } = await db.query(
      `UPDATE clients SET
         name = COALESCE($1, name),
         is_active = COALESCE($2, is_active),
         preferred_lang = COALESCE($3, preferred_lang),
         updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [name, is_active, preferred_lang, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Client not found' });
    res.json({ success: true, client: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────
// POST /api/admin/connect-client
// Body: { clientId, projectId }
// ─────────────────────────────────────────────
router.post('/connect-client', async (req, res) => {
  try {
    const { clientId, projectId } = req.body;
    if (!clientId || !projectId) {
      return res.status(400).json({ success: false, message: 'clientId and projectId required' });
    }

    // Get client & project
    const [clientResult, projectResult] = await Promise.all([
      db.query('SELECT * FROM clients WHERE id = $1', [clientId]),
      db.query('SELECT * FROM projects WHERE id = $1', [projectId])
    ]);

    if (!clientResult.rows.length) return res.status(404).json({ success: false, message: 'Client not found' });
    if (!projectResult.rows.length) return res.status(404).json({ success: false, message: 'Project not found' });

    const client  = clientResult.rows[0];
    const project = projectResult.rows[0];

    // Create link
    await db.query(
      `INSERT INTO client_projects (client_id, project_id, connected_by)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [clientId, projectId, req.admin.id]
    );

    // Log update
    await db.query(
      `INSERT INTO project_updates (project_id, type, message_ar, message_en, created_by)
       VALUES ($1, 'client_connected',
         $2, $3, $4)`,
      [projectId,
       `تم ربط العميل ${client.name || client.email} بالمشروع`,
       `Client ${client.name || client.email} connected to project`,
       req.admin.id]
    );

    // Send notification email if client has email
    if (client.email) {
      try {
        await sendProjectConnectedEmail({
          to: client.email,
          clientName: client.name,
          projectNumber: project.project_number,
          projectTitle: client.preferred_lang === 'ar' ? project.title_ar : project.title_en,
          lang: client.preferred_lang || 'ar'
        });
      } catch (emailErr) {
        console.warn('Email notification failed:', emailErr.message);
      }
    }

    res.json({
      success: true,
      message: `Client successfully connected to project ${project.project_number}`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────
// PROJECTS CRUD
// ─────────────────────────────────────────────
router.get('/projects', async (req, res) => {
  try {
    const { status, search } = req.query;
    let sql = `SELECT p.*,
      (SELECT COUNT(*) FROM client_projects cp WHERE cp.project_id = p.id) AS client_count,
      (SELECT COALESCE(SUM(amount),0) FROM payments WHERE project_id = p.id AND status='paid') AS paid_amount,
      (SELECT COALESCE(SUM(amount),0) FROM payments WHERE project_id = p.id) AS total_payment
      FROM projects p`;
    const params = [];
    const conds = [];
    if (status) { params.push(status); conds.push(`p.status = $${params.length}`); }
    if (search) { params.push(`%${search}%`); conds.push(`(p.title_ar ILIKE $${params.length} OR p.title_en ILIKE $${params.length} OR p.project_number ILIKE $${params.length})`); }
    if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
    sql += ' ORDER BY p.created_at DESC';
    const { rows } = await db.query(sql, params);
    res.json({ success: true, projects: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/projects', async (req, res) => {
  try {
    const {
      project_number, title_ar, title_en,
      description_ar, description_en,
      location_ar, location_en, project_type,
      start_date, expected_end_date, supervisor_name, total_phases
    } = req.body;

    if (!project_number || !title_ar || !title_en) {
      return res.status(400).json({ success: false, message: 'project_number, title_ar, title_en are required' });
    }

    const { rows } = await db.query(
      `INSERT INTO projects (
        project_number, title_ar, title_en,
        description_ar, description_en,
        location_ar, location_en, project_type,
        start_date, expected_end_date, supervisor_name,
        total_phases, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [project_number, title_ar, title_en,
       description_ar, description_en,
       location_ar, location_en, project_type,
       start_date, expected_end_date, supervisor_name,
       total_phases || 5, req.admin.id]
    );
    res.status(201).json({ success: true, project: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ success: false, message: 'Project number already exists' });
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/projects/:id', async (req, res) => {
  try {
    const { rows: [project] } = await db.query('SELECT * FROM projects WHERE id = $1', [req.params.id]);
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });

    const [phases, clients, payments, photos, quotations] = await Promise.all([
      db.query('SELECT * FROM project_phases WHERE project_id = $1 ORDER BY phase_number', [req.params.id]),
      db.query(`SELECT c.id, c.name, c.email, c.phone FROM clients c
        JOIN client_projects cp ON cp.client_id = c.id WHERE cp.project_id = $1`, [req.params.id]),
      db.query('SELECT * FROM payments WHERE project_id = $1 ORDER BY created_at', [req.params.id]),
      db.query('SELECT * FROM photos WHERE project_id = $1 ORDER BY created_at DESC', [req.params.id]),
      db.query('SELECT * FROM quotations WHERE project_id = $1 ORDER BY created_at DESC', [req.params.id])
    ]);

    res.json({ success: true, project, phases: phases.rows, clients: clients.rows,
      payments: payments.rows, photos: photos.rows, quotations: quotations.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/projects/:id', async (req, res) => {
  try {
    const allowed = ['title_ar','title_en','description_ar','description_en',
      'location_ar','location_en','status','current_phase','completion_pct',
      'start_date','expected_end_date','actual_end_date','supervisor_name','notes'];
    const updates = [];
    const vals = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        vals.push(req.body[key]);
        updates.push(`${key} = $${vals.length}`);
      }
    }
    if (!updates.length) return res.status(400).json({ success: false, message: 'Nothing to update' });
    vals.push(req.params.id);
    const { rows } = await db.query(
      `UPDATE projects SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${vals.length} RETURNING *`,
      vals
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Project not found' });
    res.json({ success: true, project: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────
// PHASES
// ─────────────────────────────────────────────
router.patch('/projects/:projectId/phases/:phaseId', async (req, res) => {
  try {
    const { status, title_ar, title_en } = req.body;
    const setCompleted = status === 'done' ? ', completed_at = NOW()' : '';
    const setStarted   = status === 'active' ? ', started_at = NOW()' : '';
    const { rows } = await db.query(
      `UPDATE project_phases SET
         status = COALESCE($1, status),
         title_ar = COALESCE($2, title_ar),
         title_en = COALESCE($3, title_en)
         ${setCompleted}${setStarted}
       WHERE id = $4 AND project_id = $5 RETURNING *`,
      [status, title_ar, title_en, req.params.phaseId, req.params.projectId]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Phase not found' });
    res.json({ success: true, phase: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────
// CONTACT SUBMISSIONS
// ─────────────────────────────────────────────
router.get('/contacts', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM contact_submissions ORDER BY created_at DESC'
    );
    res.json({ success: true, contacts: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/contacts/:id', async (req, res) => {
  try {
    const { status } = req.body;
    const { rows } = await db.query(
      'UPDATE contact_submissions SET status = $1 WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    res.json({ success: true, contact: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
