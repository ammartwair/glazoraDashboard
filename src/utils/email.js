// ============================================
// GLAZORA – Email Service (Nodemailer)
// ============================================
'use strict';

const nodemailer = require('nodemailer');

let transporter;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST || 'smtp.gmail.com',
      port:   parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

// ── OTP Email ─────────────────────────────────
async function sendOTPEmail({ to, otp, lang = 'ar' }) {
  const isAr = lang === 'ar';

  const subject = isAr
    ? `${otp} – رمز التحقق الخاص بك | بوابة جلازورا`
    : `${otp} – Your verification code | Glazora Portal`;

  const html = isAr ? `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8"/><style>
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #f8f7f4; margin: 0; padding: 0; direction: rtl; }
  .wrap { max-width: 520px; margin: 40px auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
  .header { background: #1a3d20; padding: 32px; text-align: center; }
  .logo { color: #fff; font-size: 28px; font-weight: 700; letter-spacing: 3px; }
  .body { padding: 40px 36px; }
  h2 { color: #1a3d20; margin-bottom: 12px; font-size: 22px; }
  p { color: #5c5954; line-height: 1.7; font-size: 15px; }
  .otp-box { background: #e4f4e6; border: 2px solid #5db86a; border-radius: 12px; text-align: center; padding: 24px; margin: 28px 0; }
  .otp { font-size: 42px; font-weight: 800; color: #1a3d20; letter-spacing: 10px; }
  .note { font-size: 13px; color: #9a9690; margin-top: 8px; }
  .footer { background: #0a1f0e; padding: 20px; text-align: center; color: rgba(255,255,255,0.4); font-size: 12px; }
</style></head>
<body>
  <div class="wrap">
    <div class="header"><div class="logo">GLAZORA</div></div>
    <div class="body">
      <h2>رمز التحقق الخاص بك</h2>
      <p>مرحباً، لقد طلبت الدخول إلى بوابة عملاء جلازورا. استخدم الرمز التالي للمتابعة:</p>
      <div class="otp-box">
        <div class="otp">${otp}</div>
        <div class="note">صالح لمدة ${process.env.OTP_EXPIRES_MINUTES || 10} دقائق فقط</div>
      </div>
      <p>إذا لم تطلب هذا الرمز، يمكنك تجاهل هذا البريد بأمان.</p>
      <p style="color:#9a9690;font-size:13px;margin-top:24px;">جلازورا لبيع الأبواب والنوافذ ذ.م.م<br/>المنطقة الصناعية الحيل، الفجيرة، الإمارات</p>
    </div>
    <div class="footer">© 2025 Glazora. All rights reserved.</div>
  </div>
</body>
</html>` : `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><style>
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #f8f7f4; margin: 0; padding: 0; }
  .wrap { max-width: 520px; margin: 40px auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
  .header { background: #1a3d20; padding: 32px; text-align: center; }
  .logo { color: #fff; font-size: 28px; font-weight: 700; letter-spacing: 3px; }
  .body { padding: 40px 36px; }
  h2 { color: #1a3d20; margin-bottom: 12px; font-size: 22px; }
  p { color: #5c5954; line-height: 1.7; font-size: 15px; }
  .otp-box { background: #e4f4e6; border: 2px solid #5db86a; border-radius: 12px; text-align: center; padding: 24px; margin: 28px 0; }
  .otp { font-size: 42px; font-weight: 800; color: #1a3d20; letter-spacing: 10px; }
  .note { font-size: 13px; color: #9a9690; margin-top: 8px; }
  .footer { background: #0a1f0e; padding: 20px; text-align: center; color: rgba(255,255,255,0.4); font-size: 12px; }
</style></head>
<body>
  <div class="wrap">
    <div class="header"><div class="logo">GLAZORA</div></div>
    <div class="body">
      <h2>Your Verification Code</h2>
      <p>You requested access to the Glazora Client Portal. Use the code below to sign in:</p>
      <div class="otp-box">
        <div class="otp">${otp}</div>
        <div class="note">Valid for ${process.env.OTP_EXPIRES_MINUTES || 10} minutes only</div>
      </div>
      <p>If you didn't request this, you can safely ignore this email.</p>
      <p style="color:#9a9690;font-size:13px;margin-top:24px;">Glazora for Doors and Windows Sales LLC<br/>AlHail Industrial, Fujairah, UAE</p>
    </div>
    <div class="footer">© 2025 Glazora. All rights reserved.</div>
  </div>
</body>
</html>`;

  return getTransporter().sendMail({
    from: process.env.EMAIL_FROM || '"Glazora Portal" <noreply@glazora.ae>',
    to,
    subject,
    html,
  });
}

// ── Project Connected Notification ────────────
async function sendProjectConnectedEmail({ to, clientName, projectNumber, projectTitle, lang = 'ar' }) {
  const isAr = lang === 'ar';
  const subject = isAr
    ? `تم ربط مشروعك بحسابك | جلازورا`
    : `Your project has been linked | Glazora`;

  const html = isAr ? `
<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"/>
<style>body{font-family:'Segoe UI',Arial,sans-serif;background:#f8f7f4;direction:rtl;}
.wrap{max-width:520px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;}
.header{background:#1a3d20;padding:32px;text-align:center;color:#fff;font-size:28px;font-weight:700;letter-spacing:3px;}
.body{padding:40px 36px;}h2{color:#1a3d20;}p{color:#5c5954;line-height:1.7;}
.proj-box{background:#e4f4e6;border-radius:12px;padding:20px 24px;margin:20px 0;}
.btn{display:inline-block;background:#1a3d20;color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:600;}
.footer{background:#0a1f0e;padding:20px;text-align:center;color:rgba(255,255,255,0.4);font-size:12px;}</style>
</head><body><div class="wrap">
<div class="header">GLAZORA</div>
<div class="body">
<h2>تم ربط مشروعك!</h2>
<p>عزيزي ${clientName || 'العميل'}،</p>
<p>يسعدنا إعلامك بأنه تم ربط مشروعك بحسابك في بوابة جلازورا. يمكنك الآن متابعة تقدم مشروعك، وعرض الصور، والاطلاع على العرض المالي وحالة المدفوعات.</p>
<div class="proj-box">
  <strong style="color:#1a3d20;">رقم المشروع:</strong> ${projectNumber}<br/>
  <strong style="color:#1a3d20;">المشروع:</strong> ${projectTitle}
</div>
<p><a href="${process.env.FRONTEND_URL || 'https://glazora.ae'}/signin.html" class="btn">دخول إلى بوابة العملاء</a></p>
</div>
<div class="footer">© 2025 Glazora. جميع الحقوق محفوظة.</div>
</div></body></html>` : `
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<style>body{font-family:'Segoe UI',Arial,sans-serif;background:#f8f7f4;}
.wrap{max-width:520px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;}
.header{background:#1a3d20;padding:32px;text-align:center;color:#fff;font-size:28px;font-weight:700;letter-spacing:3px;}
.body{padding:40px 36px;}h2{color:#1a3d20;}p{color:#5c5954;line-height:1.7;}
.proj-box{background:#e4f4e6;border-radius:12px;padding:20px 24px;margin:20px 0;}
.btn{display:inline-block;background:#1a3d20;color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:600;}
.footer{background:#0a1f0e;padding:20px;text-align:center;color:rgba(255,255,255,0.4);font-size:12px;}</style>
</head><body><div class="wrap">
<div class="header">GLAZORA</div>
<div class="body">
<h2>Your project is now linked!</h2>
<p>Dear ${clientName || 'Client'},</p>
<p>Your project has been connected to your Glazora Client Portal account. You can now track your project progress, view site photos, and manage your quotation and payments.</p>
<div class="proj-box">
  <strong style="color:#1a3d20;">Project No.:</strong> ${projectNumber}<br/>
  <strong style="color:#1a3d20;">Project:</strong> ${projectTitle}
</div>
<p><a href="${process.env.FRONTEND_URL || 'https://glazora.ae'}/signin.html" class="btn">Access Client Portal</a></p>
</div>
<div class="footer">© 2025 Glazora. All rights reserved.</div>
</div></body></html>`;

  return getTransporter().sendMail({
    from: process.env.EMAIL_FROM || '"Glazora" <noreply@glazora.ae>',
    to,
    subject,
    html,
  });
}

module.exports = { sendOTPEmail, sendProjectConnectedEmail };
