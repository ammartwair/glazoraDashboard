// ============================================
// GLAZORA – Database Migration (All Tables)
// Run: node src/config/migrate.js
// ============================================
'use strict';

require('dotenv').config();
const { query } = require('./database');

const migrations = [

// ── 1. Admins ────────────────────────────────
`CREATE TABLE IF NOT EXISTS admins (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(120) NOT NULL,
  email        VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role         VARCHAR(30) DEFAULT 'admin',  -- admin | superadmin
  is_active    BOOLEAN DEFAULT true,
  last_login   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
)`,

// ── 2. Clients ───────────────────────────────
`CREATE TABLE IF NOT EXISTS clients (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(120),
  email        VARCHAR(255) UNIQUE,
  phone        VARCHAR(30) UNIQUE,
  is_active    BOOLEAN DEFAULT true,
  preferred_lang VARCHAR(5) DEFAULT 'ar',    -- 'ar' | 'en'
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT client_contact_check CHECK (email IS NOT NULL OR phone IS NOT NULL)
)`,

// ── 3. OTP Codes ─────────────────────────────
`CREATE TABLE IF NOT EXISTS otp_codes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact      VARCHAR(255) NOT NULL,        -- email or phone
  contact_type VARCHAR(10) NOT NULL,         -- 'email' | 'phone'
  code         VARCHAR(10) NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  used         BOOLEAN DEFAULT false,
  attempts     INT DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
)`,
`CREATE INDEX IF NOT EXISTS idx_otp_contact ON otp_codes(contact)`,
`CREATE INDEX IF NOT EXISTS idx_otp_expires ON otp_codes(expires_at)`,

// ── 4. Projects ──────────────────────────────
`CREATE TABLE IF NOT EXISTS projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_number  VARCHAR(30) UNIQUE NOT NULL,  -- e.g. GZ-2025-184
  title_ar        VARCHAR(255) NOT NULL,
  title_en        VARCHAR(255) NOT NULL,
  description_ar  TEXT,
  description_en  TEXT,
  location_ar     VARCHAR(255),
  location_en     VARCHAR(255),
  project_type    VARCHAR(60),   -- villa | commercial | industrial | compound
  status          VARCHAR(30) DEFAULT 'pending',
    -- pending | active | on_hold | completed | cancelled
  current_phase   INT DEFAULT 0,
  total_phases    INT DEFAULT 5,
  completion_pct  NUMERIC(5,2) DEFAULT 0,
  start_date      DATE,
  expected_end_date DATE,
  actual_end_date DATE,
  supervisor_name VARCHAR(120),
  notes           TEXT,
  created_by      UUID REFERENCES admins(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
)`,
`CREATE INDEX IF NOT EXISTS idx_projects_number ON projects(project_number)`,
`CREATE INDEX IF NOT EXISTS idx_projects_status  ON projects(status)`,

// ── 5. Project Phases ─────────────────────────
`CREATE TABLE IF NOT EXISTS project_phases (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase_number INT NOT NULL,
  title_ar     VARCHAR(255) NOT NULL,
  title_en     VARCHAR(255) NOT NULL,
  description_ar TEXT,
  description_en TEXT,
  status       VARCHAR(20) DEFAULT 'pending',  -- pending | active | done
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
)`,

// ── 6. Client–Project Link ────────────────────
`CREATE TABLE IF NOT EXISTS client_projects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  connected_by UUID REFERENCES admins(id),
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, project_id)
)`,
`CREATE INDEX IF NOT EXISTS idx_cp_client  ON client_projects(client_id)`,
`CREATE INDEX IF NOT EXISTS idx_cp_project ON client_projects(project_id)`,

// ── 7. Quotations ─────────────────────────────
`CREATE TABLE IF NOT EXISTS quotations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  quotation_number VARCHAR(30) UNIQUE NOT NULL,
  status          VARCHAR(20) DEFAULT 'draft',  -- draft | sent | approved | revised
  subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat_pct         NUMERIC(5,2) DEFAULT 5,
  vat_amount      NUMERIC(12,2) DEFAULT 0,
  total           NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes_ar        TEXT,
  notes_en        TEXT,
  valid_until     DATE,
  approved_at     TIMESTAMPTZ,
  approved_by_client BOOLEAN DEFAULT false,
  created_by      UUID REFERENCES admins(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
)`,

// ── 8. Quotation Line Items ────────────────────
`CREATE TABLE IF NOT EXISTS quotation_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id    UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  sort_order      INT DEFAULT 0,
  description_ar  VARCHAR(500) NOT NULL,
  description_en  VARCHAR(500),
  unit_ar         VARCHAR(30),
  unit_en         VARCHAR(30),
  quantity        NUMERIC(10,3) NOT NULL,
  unit_price      NUMERIC(12,2) NOT NULL,
  total_price     NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  created_at      TIMESTAMPTZ DEFAULT NOW()
)`,

// ── 9. Payments ──────────────────────────────
`CREATE TABLE IF NOT EXISTS payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  milestone_name_ar VARCHAR(255),
  milestone_name_en VARCHAR(255),
  amount          NUMERIC(12,2) NOT NULL,
  pct_of_total    NUMERIC(5,2),
  status          VARCHAR(20) DEFAULT 'pending',  -- pending | paid | overdue
  due_date        DATE,
  paid_at         TIMESTAMPTZ,
  payment_method  VARCHAR(50),  -- bank_transfer | cash | cheque
  reference_no    VARCHAR(100),
  notes           TEXT,
  recorded_by     UUID REFERENCES admins(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
)`,
`CREATE INDEX IF NOT EXISTS idx_payments_project ON payments(project_id)`,
`CREATE INDEX IF NOT EXISTS idx_payments_status  ON payments(status)`,

// ── 10. Site Photos ───────────────────────────
`CREATE TABLE IF NOT EXISTS photos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase        VARCHAR(20) NOT NULL,  -- before | during | after
  filename     VARCHAR(255) NOT NULL,
  original_name VARCHAR(255),
  caption_ar   VARCHAR(500),
  caption_en   VARCHAR(500),
  file_size    INT,
  mime_type    VARCHAR(50),
  uploaded_by  UUID REFERENCES admins(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
)`,
`CREATE INDEX IF NOT EXISTS idx_photos_project ON photos(project_id)`,
`CREATE INDEX IF NOT EXISTS idx_photos_phase   ON photos(phase)`,

// ── 11. Contact Form Submissions ──────────────
`CREATE TABLE IF NOT EXISTS contact_submissions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name   VARCHAR(80),
  last_name    VARCHAR(80),
  phone        VARCHAR(30),
  email        VARCHAR(255),
  project_type VARCHAR(100),
  emirate      VARCHAR(50),
  message      TEXT,
  status       VARCHAR(20) DEFAULT 'new',  -- new | contacted | closed
  created_at   TIMESTAMPTZ DEFAULT NOW()
)`,

// ── 12. Project Updates / Activity Log ────────
`CREATE TABLE IF NOT EXISTS project_updates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type         VARCHAR(30),  -- status_change | payment | photo | note | phase_change
  message_ar   TEXT,
  message_en   TEXT,
  created_by   UUID REFERENCES admins(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
)`
];

async function runMigrations() {
  console.log('🔧 Running Glazora database migrations...\n');
  for (let i = 0; i < migrations.length; i++) {
    try {
      await query(migrations[i]);
      const preview = migrations[i].trim().slice(0, 60).replace(/\n/g, ' ');
      console.log(`  ✅ [${i + 1}/${migrations.length}] ${preview}...`);
    } catch (err) {
      console.error(`  ❌ Migration ${i + 1} failed:`, err.message);
      process.exit(1);
    }
  }
  console.log('\n✅ All migrations completed successfully!\n');
  process.exit(0);
}

runMigrations();
