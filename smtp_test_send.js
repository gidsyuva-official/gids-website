require('dotenv').config();
const nodemailer = require('nodemailer');
const crypto = require('crypto');

async function main() {
  const to = process.argv[2];
  if (!to) {
    console.error('Usage: node smtp_test_send.js recipient@example.com');
    process.exit(2);
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    tls: { rejectUnauthorized: false }
  });

  try {
    await transporter.verify();
  } catch (err) {
    console.error('SMTP verify failed:', err && err.message ? err.message : err);
    process.exit(3);
  }

  const token = crypto.randomBytes(16).toString('hex');
  const magicLink = `http://localhost:${process.env.PORT || 3000}/verify/${token}`;

  const mailOptions = {
    from: `"GIDS Verification" <${process.env.EMAIL_USER}>`,
    to,
    subject: 'GIDS — Verification Test Email',
    replyTo: process.env.EMAIL_USER,
    text: `Welcome to GIDS!\n\nThis is a verification test email sent to ${to}.\n\nClick to verify: ${magicLink}\n\nIf you did not request this, ignore.`,
    html: `<p>Welcome to <strong>GIDS</strong>!</p><p>This is a verification test email sent to <strong>${to}</strong>.</p><p><a href="${magicLink}">Click here to verify your account</a></p>`
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('sendMail success. response:', info.response || JSON.stringify(info));
    if (info.rejected && info.rejected.length) {
      console.error('Rejected recipients:', info.rejected);
      process.exit(4);
    }
    process.exit(0);
  } catch (err) {
    console.error('sendMail error:', err && err.message ? err.message : err);
    process.exit(5);
  }
}

main();
