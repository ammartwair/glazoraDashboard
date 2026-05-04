// ============================================
// GLAZORA – Seed File (Demo Data)
// Run: node src/config/seed.js
// ============================================
'use strict';

require('dotenv').config();
const { query } = require('./database');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

// Simple hash for demo (use bcrypt in production)
const hashPassword = (pw) =>
  crypto.createHash('sha256').update(pw + 'glazora_salt').digest('hex');

async function seed() {
  console.log('🌱 Seeding Glazora database...\n');

  // ── Admin ──────────────────────────────────
  // Use DO UPDATE to always get back the actual row ID (safe for re-runs)
  const { rows: [adminRow] } = await query(`
    INSERT INTO admins (id, name, email, password_hash, role)
    VALUES ($1, 'Glazora Admin', $2, $3, 'superadmin')
    ON CONFLICT (email) DO UPDATE SET updated_at = NOW()
    RETURNING id
  `, [uuidv4(), process.env.ADMIN_EMAIL || 'admin@glazora.ae',
      hashPassword(process.env.ADMIN_PASSWORD || 'Admin123!')]);
  const adminId = adminRow.id;
  console.log('  ✅ Admin user ready');

  // ── Demo client ────────────────────────────
  const { rows: [clientRow] } = await query(`
    INSERT INTO clients (id, name, email, phone, preferred_lang)
    VALUES ($1, 'Mohammed Al Rashidi', 'client@demo.com', '+971501112222', 'ar')
    ON CONFLICT (email) DO UPDATE SET updated_at = NOW()
    RETURNING id
  `, [uuidv4()]);
  const clientId = clientRow.id;
  console.log('  ✅ Demo client ready');

  // ── Demo project ───────────────────────────
  const { rows: [projectRow] } = await query(`
    INSERT INTO projects (
      id, project_number, title_ar, title_en,
      description_ar, description_en,
      location_ar, location_en, project_type, status,
      current_phase, total_phases, completion_pct,
      start_date, expected_end_date, supervisor_name,
      created_by
    ) VALUES (
      $1, 'GZ-2025-184',
      'فيلا الكرامة – نوافذ وأبواب وبرجولة',
      'Al Karama Villa – Windows, Doors & Pergola',
      'مشروع تركيب نظام ستائر زجاجية وأبواب منزلقة وبرجولة ألمنيوم',
      'Installation of curtain wall system, sliding doors and aluminum pergola',
      'الكرامة، دبي، الإمارات',
      'Al Karama, Dubai, UAE',
      'villa', 'active', 3, 5, 62,
      '2025-04-10', '2025-07-20', 'Ahmed Al Mansoori',
      $2
    ) ON CONFLICT (project_number) DO UPDATE SET updated_at = NOW()
    RETURNING id
  `, [uuidv4(), adminId]);
  const projectId = projectRow.id;
  console.log('  ✅ Demo project ready');

  // ── Project Phases (delete + re-insert for idempotency) ────────────
  await query('DELETE FROM project_phases WHERE project_id = $1', [projectId]);
  const phases = [
    { n: 1, ar: 'المعاينة والقياس', en: 'Site Survey & Measurements', status: 'done' },
    { n: 2, ar: 'اعتماد التصميم والتصنيع', en: 'Design Approval & Fabrication', status: 'done' },
    { n: 3, ar: 'تركيب الإطارات', en: 'Frame Installation', status: 'active' },
    { n: 4, ar: 'تركيب الزجاج والملحقات', en: 'Glass & Infill Installation', status: 'pending' },
    { n: 5, ar: 'الإنهاء والاختبار والتسليم', en: 'Finishing, Testing & Handover', status: 'pending' },
  ];
  for (const p of phases) {
    await query(`
      INSERT INTO project_phases (project_id, phase_number, title_ar, title_en, status)
      VALUES ($1, $2, $3, $4, $5)
    `, [projectId, p.n, p.ar, p.en, p.status]);
  }
  console.log('  ✅ Project phases ready');

  // ── Link client to project ─────────────────
  await query(`
    INSERT INTO client_projects (client_id, project_id, connected_by)
    VALUES ($1, $2, $3)
    ON CONFLICT DO NOTHING
  `, [clientId, projectId, adminId]);
  console.log('  ✅ Client linked to project');

  // ── Quotation ──────────────────────────────
  // Fetch existing quotation or create new one
  const { rows: [quotRow] } = await query(`
    INSERT INTO quotations (
      id, project_id, quotation_number, status,
      subtotal, vat_pct, vat_amount, total,
      approved_by_client, created_by
    ) VALUES ($1, $2, 'QT-2025-184', 'approved',
      90476.19, 5, 4523.81, 95000,
      true, $3)
    ON CONFLICT (quotation_number) DO UPDATE SET updated_at = NOW()
    RETURNING id
  `, [uuidv4(), projectId, adminId]);
  const quotId = quotRow.id;

  // Delete existing items then re-insert
  await query('DELETE FROM quotation_items WHERE quotation_id = $1', [quotId]);
  const items = [
    { ar: 'نظام ستارة زجاجية هيكلية (عازل حراري)', en: 'Structural Curtain Wall System (Thermally Broken)', unit_ar: 'م²', unit_en: 'm²', qty: 48, price: 650 },
    { ar: 'نظام باب منزلق (3 أوراق – 6 متر)', en: 'Sliding Door System (3-panel, 6m wide)', unit_ar: 'طقم', unit_en: 'Set', qty: 2, price: 8500 },
    { ar: 'باب محوري أمامي (2.8 متر ارتفاع)', en: 'Aluminum Pivot Front Door (2.8m)', unit_ar: 'طقم', unit_en: 'Set', qty: 1, price: 12000 },
    { ar: 'برجولة ألمنيوم (6×4 متر)', en: 'Aluminum Pergola (6m × 4m)', unit_ar: 'طقم', unit_en: 'Set', qty: 1, price: 18500 },
    { ar: 'درابزين زجاجي (منطقة المسبح 18م)', en: 'Glass Handrail System (pool area, 18lm)', unit_ar: 'م.ط', unit_en: 'lm', qty: 18, price: 480 },
    { ar: 'توريد وتوصيل وتركيب', en: 'Supply, Delivery & Installation', unit_ar: 'بند', unit_en: 'Lot', qty: 1, price: 7660 },
  ];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    await query(`
      INSERT INTO quotation_items (quotation_id, sort_order, description_ar, description_en, unit_ar, unit_en, quantity, unit_price)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [quotId, i + 1, it.ar, it.en, it.unit_ar, it.unit_en, it.qty, it.price]);
  }
  console.log('  ✅ Quotation and items ready');

  // ── Payments (delete + re-insert for idempotency) ──────────────────
  await query('DELETE FROM payments WHERE project_id = $1', [projectId]);
  const payments = [
    { ar: 'دفعة أولى (30%)', en: 'Initial Deposit (30%)', amount: 28500, pct: 30, status: 'paid', due: '2025-04-05', paid: '2025-04-05', method: 'bank_transfer' },
    { ar: 'مرحلة 2 – بعد تركيب الإطارات (30%)', en: 'Milestone 2 – After Frame Installation (30%)', amount: 28500, pct: 30, status: 'paid', due: '2025-05-12', paid: '2025-05-12', method: 'bank_transfer' },
    { ar: 'مرحلة 3 – بعد تركيب الزجاج (20%)', en: 'Milestone 3 – After Glass Installation (20%)', amount: 19000, pct: 20, status: 'pending', due: '2025-06-15', paid: null, method: null },
    { ar: 'الدفعة الأخيرة عند التسليم (20%)', en: 'Final Payment on Handover (20%)', amount: 19000, pct: 20, status: 'pending', due: null, paid: null, method: null },
  ];
  for (const p of payments) {
    await query(`
      INSERT INTO payments (project_id, milestone_name_ar, milestone_name_en, amount, pct_of_total, status, due_date, paid_at, payment_method, recorded_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [projectId, p.ar, p.en, p.amount, p.pct, p.status, p.due, p.paid, p.method, adminId]);
  }
  console.log('  ✅ Payment schedule ready');

  console.log('\n🎉 Seed completed!\n');
  console.log('  Admin email    :', process.env.ADMIN_EMAIL || 'admin@glazora.ae');
  console.log('  Admin password :', process.env.ADMIN_PASSWORD || 'Admin123!');
  console.log('  Demo client    : client@demo.com  (sign in via OTP)');
  console.log('  Demo project   : GZ-2025-184\n');
  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
