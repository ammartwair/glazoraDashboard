// ============================================
// GLAZORA – Auth Routes
// POST /api/auth/send-otp
// POST /api/auth/verify-otp
// POST /api/auth/admin/login
// POST /api/auth/admin/logout
// ============================================
"use strict";

const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const db = require("../config/database");
const { sendOTPEmail } = require("../utils/email");
const { requireAdmin } = require("../middleware/auth");

// Strict rate limit on OTP to prevent abuse
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 min
  max: 5,
  message: {
    success: false,
    message: "Too many OTP requests. Please wait 10 minutes.",
  },
});

// ── Generate OTP ─────────────────────────────
function generateOTP(length = 6) {
  let otp = "";
  for (let i = 0; i < length; i++) {
    otp += crypto.randomInt(0, 10).toString();
  }
  return otp;
}

// Simple hash (replace with bcrypt in production)
function hashPassword(pw) {
  return crypto
    .createHash("sha256")
    .update(pw + "glazora_salt")
    .digest("hex");
}

// ─────────────────────────────────────────────
// POST /api/auth/send-otp
// Body: { contact: "email@...", contactType: "email", lang: "ar" }
// ─────────────────────────────────────────────
router.post("/send-otp", otpLimiter, async (req, res) => {
  try {
    const { contact, contactType = "email", lang = "ar" } = req.body;

    if (!contact) {
      return res
        .status(400)
        .json({ success: false, message: "Contact is required" });
    }
    if (!["email", "phone"].includes(contactType)) {
      return res.status(400).json({
        success: false,
        message: "contactType must be email or phone",
      });
    }

    // Check if client exists (we allow sending OTP regardless — create account on verify)
    const otp = generateOTP(parseInt(process.env.OTP_LENGTH) || 6);
    const expiresAt = new Date(
      Date.now() +
        (parseInt(process.env.OTP_EXPIRES_MINUTES) || 10) * 60 * 1000,
    );

    // Invalidate old unused OTPs for this contact
    await db.query(
      "UPDATE otp_codes SET used = true WHERE contact = $1 AND used = false",
      [contact],
    );

    // Save new OTP
    await db.query(
      `INSERT INTO otp_codes (contact, contact_type, code, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [contact, contactType, otp, expiresAt],
    );

    // Send email
    if (contactType === "email") {
      setImmediate(() => {
        sendOTPEmail({ to: contact, otp, lang }).catch((err) =>
          console.error("EMAIL ERROR:", err.message),
        );
      });
    }
    // For phone: integrate SMS provider here (Twilio / Unifonic)

    // In development, return OTP in response for testing
    const devExtra =
      process.env.NODE_ENV === "development" ? { _dev_otp: otp } : {};

    return res.json({
      success: true,
      message:
        lang === "ar"
          ? `تم إرسال رمز التحقق إلى ${contact}`
          : `Verification code sent to ${contact}`,
      expiresInMinutes: parseInt(process.env.OTP_EXPIRES_MINUTES) || 10,
      ...devExtra,
    });
  } catch (err) {
    console.error("send-otp error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to send OTP" });
  }
});

// ─────────────────────────────────────────────
// POST /api/auth/verify-otp
// Body: { contact, otp, lang }
// ─────────────────────────────────────────────
router.post("/verify-otp", async (req, res) => {
  try {
    const { contact, otp, lang = "ar" } = req.body;
    if (!contact || !otp) {
      return res
        .status(400)
        .json({ success: false, message: "Contact and OTP are required" });
    }

    // Fetch latest valid OTP
    const { rows: otpRows } = await db.query(
      `SELECT * FROM otp_codes
       WHERE contact = $1 AND used = false AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [contact],
    );

    if (!otpRows.length) {
      return res.status(400).json({
        success: false,
        message:
          lang === "ar"
            ? "رمز التحقق غير صالح أو منتهي الصلاحية"
            : "OTP is invalid or expired",
      });
    }

    const otpRecord = otpRows[0];

    // Increment attempts
    await db.query(
      "UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1",
      [otpRecord.id],
    );

    // Max attempts
    if (otpRecord.attempts >= 5) {
      await db.query("UPDATE otp_codes SET used = true WHERE id = $1", [
        otpRecord.id,
      ]);
      return res.status(400).json({
        success: false,
        message:
          lang === "ar"
            ? "تجاوزت الحد الأقصى للمحاولات. يرجى طلب رمز جديد."
            : "Too many attempts. Please request a new code.",
      });
    }

    if (otpRecord.code !== otp.toString()) {
      return res.status(400).json({
        success: false,
        message: lang === "ar" ? "الرمز غير صحيح" : "Incorrect code",
      });
    }

    // Mark OTP used
    await db.query("UPDATE otp_codes SET used = true WHERE id = $1", [
      otpRecord.id,
    ]);

    // Find or create client
    const field = otpRecord.contact_type === "email" ? "email" : "phone";
    let { rows: clientRows } = await db.query(
      `SELECT * FROM clients WHERE ${field} = $1`,
      [contact],
    );

    let client;
    let isNew = false;
    if (clientRows.length) {
      client = clientRows[0];
    } else {
      // Auto-create client account
      const { rows: newClient } = await db.query(
        `INSERT INTO clients (${field}, preferred_lang)
         VALUES ($1, $2) RETURNING *`,
        [contact, lang],
      );
      client = newClient[0];
      isNew = true;
    }

    // Check if client has any connected project
    const { rows: projectRows } = await db.query(
      `SELECT cp.project_id, p.project_number, p.title_ar, p.title_en, p.status
       FROM client_projects cp
       JOIN projects p ON p.id = cp.project_id
       WHERE cp.client_id = $1
       ORDER BY cp.connected_at DESC`,
      [client.id],
    );

    const hasProject = projectRows.length > 0;

    // Issue JWT
    const token = jwt.sign(
      { sub: client.id, role: "client", email: client.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" },
    );

    return res.json({
      success: true,
      isNew,
      hasProject,
      token,
      client: {
        id: client.id,
        name: client.name,
        email: client.email,
        phone: client.phone,
        preferredLang: client.preferred_lang,
      },
      projects: projectRows,
    });
  } catch (err) {
    console.error("verify-otp error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Verification failed" });
  }
});

// ─────────────────────────────────────────────
// POST /api/auth/admin/login
// Body: { email, password }
// ─────────────────────────────────────────────
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: "Too many login attempts" },
});

router.post("/admin/login", adminLoginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Email and password required" });
    }

    const { rows } = await db.query(
      "SELECT * FROM admins WHERE email = $1 AND is_active = true",
      [email.toLowerCase().trim()],
    );

    if (!rows.length) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }

    const admin = rows[0];
    const hash = hashPassword(password);

    if (hash !== admin.password_hash) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }

    // Update last login
    await db.query("UPDATE admins SET last_login = NOW() WHERE id = $1", [
      admin.id,
    ]);

    const token = jwt.sign(
      { sub: admin.id, role: admin.role, email: admin.email },
      process.env.JWT_ADMIN_SECRET || process.env.JWT_SECRET,
      { expiresIn: "12h" },
    );

    return res.json({
      success: true,
      token,
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (err) {
    console.error("admin login error:", err.message);
    return res.status(500).json({ success: false, message: "Login failed" });
  }
});

// GET /api/auth/admin/me
router.get("/admin/me", requireAdmin, (req, res) => {
  res.json({ success: true, admin: req.admin });
});

module.exports = router;
