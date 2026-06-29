'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const validator = require('validator');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'gids_database',
  waitForConnections: true,
  connectionLimit: 10
};

let pool;

async function ensureColumnExists(table, column, definition) {
  const res = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column]
  );

  if (res.rows.length === 0) {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`✅ Added missing column ${table}.${column}`);
  }
}

async function initDatabase() {
  pool = new Pool(dbConfig);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS consultations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      email VARCHAR(200) NOT NULL,
      phone VARCHAR(30) NOT NULL,
      service_interest VARCHAR(100) NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS enroll (
      id SERIAL PRIMARY KEY,
      full_name VARCHAR(150) NOT NULL,
      phone_number VARCHAR(30) NOT NULL,
      email_address VARCHAR(200) NOT NULL,
      learning_mode VARCHAR(50) NOT NULL,
      course_name VARCHAR(200) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reviews_table (
      id SERIAL PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      email VARCHAR(255) NOT NULL,
      role VARCHAR(100) DEFAULT 'Learner',
      rating SMALLINT NOT NULL,
      comment TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      first_name VARCHAR(100),
      last_name VARCHAR(20),
      login_name VARCHAR(120),
      full_name VARCHAR(100),
      username VARCHAR(50),
      email VARCHAR(255) NOT NULL UNIQUE,
      phone VARCHAR(20),
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pending_users (
      id SERIAL PRIMARY KEY,
      first_name VARCHAR(100),
      last_name VARCHAR(20),
      login_name VARCHAR(120),
      full_name VARCHAR(100),
      username VARCHAR(50),
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(20),
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50),
      verification_token TEXT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureColumnExists('users', 'first_name', 'VARCHAR(100)');
  await ensureColumnExists('users', 'last_name', 'VARCHAR(20)');
  await ensureColumnExists('users', 'login_name', 'VARCHAR(120)');
  await ensureColumnExists('users', 'reset_token', 'TEXT');
  await ensureColumnExists('users', 'reset_token_expires_at', 'TIMESTAMP');
  await ensureColumnExists('pending_users', 'first_name', 'VARCHAR(100)');
  await ensureColumnExists('pending_users', 'last_name', 'VARCHAR(20)');
  await ensureColumnExists('pending_users', 'login_name', 'VARCHAR(120)');

  await pool.query(`
    UPDATE users
    SET
      first_name = COALESCE(NULLIF(first_name, ''), split_part(full_name, ' ', 1)),
      last_name = COALESCE(NULLIF(last_name, ''), username),
      login_name = COALESCE(NULLIF(login_name, ''), username, concat_ws(' ', first_name, last_name))
    WHERE (first_name IS NULL OR first_name = '' OR last_name IS NULL OR last_name = '' OR login_name IS NULL OR login_name = '')
      AND (full_name IS NOT NULL OR username IS NOT NULL)
  `);

  await pool.query(`
    UPDATE pending_users
    SET
      first_name = COALESCE(NULLIF(first_name, ''), split_part(full_name, ' ', 1)),
      last_name = COALESCE(NULLIF(last_name, ''), username),
      login_name = COALESCE(NULLIF(login_name, ''), username, concat_ws(' ', first_name, last_name))
    WHERE (first_name IS NULL OR first_name = '' OR last_name IS NULL OR last_name = '' OR login_name IS NULL OR login_name = '')
      AND (full_name IS NOT NULL OR username IS NOT NULL)
  `);

  console.log(`✅ PostgreSQL connected — database: ${dbConfig.database}`);
}

// Email setup — using Brevo HTTP API (no SMTP ports needed, works on Render free tier)
const BREVO_API_KEY = (process.env.BREVO_API_KEY || '').trim();
const EMAIL_FROM = (process.env.EMAIL_FROM || '').trim();
let emailConfigured = false;
if (BREVO_API_KEY && EMAIL_FROM) {
  emailConfigured = true;
  console.log('✅ Brevo email configured and ready to send email');
} else {
  console.warn('⚠️ BREVO_API_KEY or EMAIL_FROM not set - verification emails will not work');
}

// Book a Consultation — POST /api/contact
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, phone, service, message } = req.body;

    if (!name || !email || !phone || !service || !message) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    const result = await pool.query(
      `INSERT INTO consultations (name, email, phone, service_interest, message)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [name.trim(), email.trim(), phone.trim(), service.trim(), message.trim()]
    );

    res.json({
      success: true,
      message: 'Consultation booked successfully.',
      id: result.rows[0] && result.rows[0].id
    });
  } catch (err) {
    console.error('Contact error:', err.message);
    res.status(500).json({ success: false, message: 'Server error. Could not save consultation.' });
  }
});

// Enroll — POST /api/enroll (course_name = exact card clicked)
app.post('/api/enroll', async (req, res) => {
  try {
    const { name, phone, email, course, mode } = req.body;

    if (!name || !phone || !email || !course || !mode) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    const result = await pool.query(
      `INSERT INTO enroll (full_name, phone_number, email_address, learning_mode, course_name)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [name.trim(), phone.trim(), email.trim(), mode.trim(), course.trim()]
    );

    res.json({
      success: true,
      message: 'Enrollment saved successfully.',
      id: result.rows[0] && result.rows[0].id
    });
  } catch (err) {
    console.error('Enroll error:', err.message);
    res.status(500).json({ success: false, message: 'Server error. Could not save enrollment.' });
  }
});

// Enrollment reports — counts by course and by date
app.get('/api/reports/enrollments', async (req, res) => {
  try {
    const byCourseRes = await pool.query(
      `SELECT course_name AS course, COUNT(*) AS count
       FROM enroll
       GROUP BY course_name
       ORDER BY COUNT(*) DESC`
    );
    const byDateRes = await pool.query(
      `SELECT DATE(created_at) AS date, COUNT(*) AS count
       FROM enroll
       GROUP BY DATE(created_at)
       ORDER BY DATE(created_at) DESC`
    );

    res.json({ success: true, byCourse: byCourseRes.rows, byDate: byDateRes.rows });
  } catch (err) {
    console.error('Enrollment report error:', err.message);
    res.status(500).json({ success: false, message: 'Server error. Could not retrieve enrollment reports.' });
  }
});

// Consultation reports — counts by service and by date
app.get('/api/reports/consultations', async (req, res) => {
  try {
    const byServiceRes = await pool.query(
      `SELECT service_interest AS service, COUNT(*) AS count
       FROM consultations
       GROUP BY service_interest
       ORDER BY COUNT(*) DESC`
    );
    const byDateRes = await pool.query(
      `SELECT DATE(created_at) AS date, COUNT(*) AS count
       FROM consultations
       GROUP BY DATE(created_at)
       ORDER BY DATE(created_at) DESC`
    );

    res.json({ success: true, byService: byServiceRes.rows, byDate: byDateRes.rows });
  } catch (err) {
    console.error('Consultation report error:', err.message);
    res.status(500).json({ success: false, message: 'Server error. Could not retrieve consultation reports.' });
  }
});

// Reviews list — GET /api/reviews
app.get('/api/reviews', async (req, res) => {
  try {
    const reviewsRes = await pool.query(
      `SELECT id, name, email, role, rating, comment, created_at
       FROM reviews_table
       ORDER BY created_at DESC`
    );
    res.json({ success: true, reviews: reviewsRes.rows });
  } catch (err) {
    console.error('Reviews load error:', err.message);
    res.status(500).json({ success: false, message: 'Server error. Could not load reviews.' });
  }
});

// Add a review — POST /api/reviews/add
app.post('/api/reviews/add', async (req, res) => {
  try {
    const { name, email, role, rating, comment } = req.body;
    if (!name || !email || !rating || !comment) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }
    if (!validator.isEmail(email)) {
      return res.status(400).json({ success: false, message: 'Valid email is required.' });
    }
    const parsedRating = Number(rating);
    if (!Number.isInteger(parsedRating) || parsedRating < 1 || parsedRating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be a number between 1 and 5.' });
    }

    const result = await pool.query(
      `INSERT INTO reviews_table (name, email, role, rating, comment)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [name.trim(), email.trim(), role ? role.trim() : 'Learner', parsedRating, comment.trim()]
    );

    res.json({ success: true, message: 'Review submitted successfully.', id: result.rows[0] && result.rows[0].id });
  } catch (err) {
    console.error('Review add error:', err.message);
    res.status(500).json({ success: false, message: 'Server error. Could not save your review.' });
  }
});

const REVIEW_ADMIN_EMAIL = 'gids.yuva@gmail.com';

// Delete a review — POST /api/reviews/delete
app.post('/api/reviews/delete', async (req, res) => {
  try {
    const { id, email } = req.body;
    if (!id || !email) {
      return res.status(400).json({ success: false, message: 'Review id and email are required.' });
    }
    if (!validator.isEmail(email)) {
      return res.status(400).json({ success: false, message: 'Valid email is required.' });
    }

    const rowsRes = await pool.query(`SELECT email FROM reviews_table WHERE id = $1`, [id]);
    const rows = rowsRes.rows;
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Review not found.' });
    }
    const reviewOwner = rows[0].email;
    if (reviewOwner !== email.trim() && email.trim().toLowerCase() !== REVIEW_ADMIN_EMAIL) {
      return res.status(403).json({ success: false, message: 'Only the review author or admin may delete this review.' });
    }
    await pool.query(`DELETE FROM reviews_table WHERE id = $1`, [id]);
    res.json({ success: true, message: 'Review deleted successfully.' });
  } catch (err) {
    console.error('Review delete error:', err.message);
    res.status(500).json({ success: false, message: 'Server error. Could not delete review.' });
  }
});

// Signup - POST /api/signup
app.post('/api/signup', async (req, res) => {
  try {
    const firstName = (req.body.firstName || '').trim();
    const lastName = (req.body.lastName || '').trim();
    const email = (req.body.email || '').trim();
    const phone = (req.body.phone || '').trim();
    const password = req.body.password || '';
    const confirmPassword = req.body.confirmPassword || '';
    const role = (req.body.role || '').trim();
    const agreeTerms = req.body.agreeTerms === true || req.body.agreeTerms === 'true';
    const loginName = `${firstName} ${lastName}`.trim();

    console.log('Signup request body:', {
      firstName,
      lastName,
      email,
      phone,
      password: password ? '***' : '',
      confirmPassword: confirmPassword ? '***' : '',
      role,
      agreeTerms,
      loginName
    });

    // Validate all fields
    if (!firstName || !lastName || !email || !phone || !password || !confirmPassword || !role) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    if (!agreeTerms) {
      return res.status(400).json({ success: false, message: 'You must agree to the terms and conditions.' });
    }

    // Validate email format
    if (!validator.isEmail(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email address.' });
    }

    // Validate password match
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match.' });
    }

    // Validate last name initial style
    if (!/^[A-Za-z]{1,4}$/.test(lastName.trim())) {
      return res.status(400).json({ success: false, message: 'Please enter a valid last name initial.' });
    }

    // Check if user already exists by email
    const existingUsersRes = await pool.query('SELECT id FROM users WHERE email = $1', [email.trim()]);
    const existingPendingRes = await pool.query('SELECT id FROM pending_users WHERE email = $1', [email.trim()]);
    const existingUsers = existingUsersRes.rows;
    const existingPending = existingPendingRes.rows;
    if (existingUsers.length > 0 || existingPending.length > 0) {
      return res.status(400).json({ success: false, message: 'Email already registered. Please sign in or use a different email.' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const expiresMinutes = Number(process.env.VERIFY_LINK_EXPIRES_MINUTES) || 15;
    const expiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000);

    // Generate magic link (works for both local and deployed)
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const magicLink = `${baseUrl}/verify/${verificationToken}`;

    if (!BREVO_API_KEY || !EMAIL_FROM) {
      return res.status(500).json({
        success: false,
        message: 'Email verification is not configured. Please contact the administrator to enable email delivery.'
      });
    }

    const emailHtml = `
        <h1>Welcome to Global India Digital Solution!</h1>
        <p>Hi ${firstName || loginName},</p>
        <p>Click the link below to verify your account:</p>
        <a href="${magicLink}" style="font-size: 18px; padding: 10px 20px; background: #1a1a8e; color: white; text-decoration: none; border-radius: 5px;">Verify Account</a>
        <p>This link expires in ${expiresMinutes} minutes.</p>
        <p>If you didn't create this account, you can ignore this email.</p>
      `;

    try {
      const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': BREVO_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          sender: { name: 'GIDS Verification', email: EMAIL_FROM },
          to: [{ email: email }],
          subject: 'Verify your GIDS account',
          htmlContent: emailHtml,
          textContent: `Welcome to Global India Digital Solution!\n\nHi ${firstName || loginName},\n\nClick the link below to verify your account:\n${magicLink}\n\nThis link expires in ${expiresMinutes} minutes.\n\nIf you didn't create this account, ignore this message.`
        })
      });

      const brevoData = await brevoRes.json();

      if (!brevoRes.ok) {
        throw new Error(brevoData && brevoData.message ? brevoData.message : `Brevo API error (status ${brevoRes.status})`);
      }

      console.log(`📧 Verification email sent to ${email}`);
      console.log('Mail send info:', JSON.stringify(brevoData));
    } catch (mailErr) {
      console.error('Verification email send failed:', mailErr);
      return res.status(500).json({
        success: false,
        message: 'Verification email could not be sent. Please check email configuration and try again.'
      });
    }

    // Save to pending_users after email is successfully queued
    await pool.query(
      `INSERT INTO pending_users (first_name, last_name, login_name, full_name, username, email, phone, password, role, verification_token, expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [firstName.trim(), lastName.trim(), loginName, loginName, loginName, email.trim(), phone.trim(), hashedPassword, role.trim(), verificationToken, expiresAt]
    );

    const responsePayload = {
      success: true,
      message: 'Verification email sent to your address. Please check your inbox and click the verification link to complete your registration.'
    };

    console.log('Signup route success response:', responsePayload);
    res.json(responsePayload);

  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ success: false, message: 'Server error. Could not process signup.' });
  }
});

// Verify magic link by query or path
app.get('/verify', (req, res) => {
  const token = req.query.token;
  if (!token) {
    return res.send('<h1>Invalid Verification Link</h1><p>No token was provided.</p>');
  }
  return res.redirect(`/verify/${encodeURIComponent(token)}`);
});

// Verify magic link - GET /verify/:token
app.get('/verify/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Find pending user
    const pendingUsersRes = await pool.query('SELECT * FROM pending_users WHERE verification_token = $1', [token]);
    const pendingUsers = pendingUsersRes.rows;

    if (pendingUsers.length === 0) {
      return res.send(`
        <html>
          <head><title>Invalid Verification Link</title></head>
          <body>
            <h1>Invalid Verification Link</h1>
            <p>This link is invalid or has already been used.</p>
            <p>If you already verified your account, please <a href="/">sign in</a>.</p>
          </body>
        </html>
      `);
    }

    const pendingUser = pendingUsers[0];

    // Check if token expired
    if (new Date() > new Date(pendingUser.expires_at)) {
      // Delete expired pending user
      await pool.query('DELETE FROM pending_users WHERE id = $1', [pendingUser.id]);
      return res.send('<h1>Verification Link Expired</h1><p>This link has expired. Please sign up again.</p>');
    }

    // Move user to users table
    await pool.query(
      `INSERT INTO users (first_name, last_name, login_name, full_name, username, email, phone, password, role)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [pendingUser.first_name, pendingUser.last_name, pendingUser.login_name, pendingUser.login_name, pendingUser.login_name, pendingUser.email, pendingUser.phone, pendingUser.password, pendingUser.role]
    );

    // Delete pending user
    await pool.query('DELETE FROM pending_users WHERE id = $1', [pendingUser.id]);

    // Create JWT token
    const jwtToken = jwt.sign({ id: pendingUser.id, email: pendingUser.email }, process.env.JWT_SECRET || 'fallback-secret-change-in-production', { expiresIn: '7d' });
    const fullName = `${pendingUser.first_name || ''} ${pendingUser.last_name || ''}`.trim() || pendingUser.login_name;

    // Redirect to dashboard with token and profile details (for frontend autofill)
    res.send(`
      <html>
        <head>
          <title>Account Verified</title>
          <script>
            localStorage.setItem('authToken', ${JSON.stringify(jwtToken)});
            localStorage.setItem('gids_user', ${JSON.stringify(pendingUser.login_name)});
            localStorage.setItem('gids_full_name', ${JSON.stringify(fullName)});
            localStorage.setItem('gids_email', ${JSON.stringify(pendingUser.email)});
            localStorage.setItem('gids_phone', ${JSON.stringify(pendingUser.phone)});
            sessionStorage.setItem('gids_logged_in', 'true');
            sessionStorage.setItem('gids_user', ${JSON.stringify(pendingUser.login_name)});
            window.location.href = '/';
            setTimeout(() => {
              window.location.href = '/';
            }, 500);
          </script>
        </head>
        <body>
          <h1>Account Verified Successfully!</h1>
          <p>Redirecting you to the dashboard...</p>
        </body>
      </html>
    `);

  } catch (err) {
    console.error('Verification error:', err.message);
    res.status(500).send('<h1>Server Error</h1><p>Something went wrong during verification.</p>');
  }
});

// Login - POST /api/login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const identifier = username ? username.trim() : '';

    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    const usersRes = await pool.query('SELECT * FROM users WHERE login_name = $1 OR username = $1 OR email = $1', [identifier]);
    const users = usersRes.rows;

    if (users.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }
    if (users.length > 1 && !validator.isEmail(identifier)) {
      return res.status(400).json({ success: false, message: 'Multiple users found with this name. Please sign in using your email address.' });
    }
    const user = users[0];
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET || 'fallback-secret-change-in-production', { expiresIn: '7d' });

    res.json({
      success: true,
      message: 'Login successful!',
      token: token,
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        loginName: user.login_name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        createdAt: user.created_at
      }
    });

  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ success: false, message: 'Server error. Could not process login.' });
  }
});

// ============================================================
// FORGOT PASSWORD — POST /api/forgot-password
// ============================================================
app.post('/api/forgot-password', async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();

    if (!email || !validator.isEmail(email)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }

    // Find user by email
    const userRes = await pool.query('SELECT * FROM users WHERE LOWER(email) = $1', [email]);
    const user = userRes.rows;

    // Always return success to prevent email enumeration
    if (user.length === 0) {
      return res.json({ success: true, message: 'If an account with that email exists, a password reset link has been sent.' });
    }

    const foundUser = user[0];

    // Generate secure reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresMinutes = Number(process.env.RESET_LINK_EXPIRES_MINUTES) || 15;
    const expiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000);

    // Save reset token to user record
    await pool.query(
      'UPDATE users SET reset_token = $1, reset_token_expires_at = $2 WHERE id = $3',
      [resetToken, expiresAt, foundUser.id]
    );

    if (!BREVO_API_KEY || !EMAIL_FROM) {
      return res.status(500).json({
        success: false,
        message: 'Password reset email is not configured. Please contact the administrator.'
      });
    }

    // Generate reset link
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const resetLink = `${baseUrl}/api/reset-password/${resetToken}`;

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #1a1a8e;">Password Reset Request</h1>
        <p>Hi ${foundUser.first_name || foundUser.login_name || 'User'},</p>
        <p>We received a request to reset your password for your GIDS account.</p>
        <p>Click the button below to set a new password:</p>
        <a href="${resetLink}" style="display: inline-block; font-size: 16px; padding: 12px 28px; background: #1a1a8e; color: white; text-decoration: none; border-radius: 6px; margin: 16px 0;">Reset Password</a>
        <p style="color: #666;">This link expires in ${expiresMinutes} minutes.</p>
        <p style="color: #666;">If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #999; font-size: 12px;">Global India Digital Solution — Education · Training · Business</p>
      </div>
    `;

    try {
      const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': BREVO_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          sender: { name: 'GIDS Support', email: EMAIL_FROM },
          to: [{ email: email }],
          subject: 'Reset Your GIDS Password',
          htmlContent: emailHtml,
          textContent: `Password Reset Request\n\nHi ${foundUser.first_name || foundUser.login_name || 'User'},\n\nWe received a request to reset your password for your GIDS account.\n\nClick the link below to set a new password:\n${resetLink}\n\nThis link expires in ${expiresMinutes} minutes.\n\nIf you didn't request a password reset, you can safely ignore this email.`
        })
      });

      const brevoData = await brevoRes.json();

      if (!brevoRes.ok) {
        throw new Error(brevoData && brevoData.message ? brevoData.message : `Brevo API error (status ${brevoRes.status})`);
      }

      console.log(`📧 Password reset email sent to ${email}`);
    } catch (mailErr) {
      console.error('Password reset email send failed:', mailErr);
      return res.status(500).json({
        success: false,
        message: 'Failed to send password reset email. Please check email configuration and try again.'
      });
    }

    res.json({ success: true, message: 'If an account with that email exists, a password reset link has been sent.' });

  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ success: false, message: 'Server error. Could not process password reset request.' });
  }
});

// ============================================================
// RESET PASSWORD PAGE — GET /api/reset-password/:token
// ============================================================
app.get('/api/reset-password/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Find user with valid reset token
    const userRes = await pool.query(
      'SELECT id, first_name, login_name, email FROM users WHERE reset_token = $1 AND reset_token_expires_at > NOW()',
      [token]
    );
    const user = userRes.rows;

    if (user.length === 0) {
      return res.send(`
        <html>
          <head>
            <title>Reset Link Expired</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <style>
              body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
              .card { background: white; border-radius: 12px; padding: 40px; max-width: 440px; width: 90%; box-shadow: 0 4px 24px rgba(0,0,0,0.1); text-align: center; }
              h1 { color: #dc2626; font-size: 1.5rem; margin-bottom: 12px; }
              p { color: #555; line-height: 1.6; margin-bottom: 24px; }
              a { display: inline-block; padding: 12px 28px; background: #1a1a8e; color: white; text-decoration: none; border-radius: 6px; font-size: 0.95rem; }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>This reset link has expired</h1>
              <p>Password reset links are valid for ${Number(process.env.RESET_LINK_EXPIRES_MINUTES) || 15} minutes only.</p>
              <p>Please request a new password reset link.</p>
              <a href="/">Go to Login</a>
            </div>
          </body>
        </html>
      `);
    }

    const foundUser = user[0];
    const name = foundUser.first_name || foundUser.login_name || 'User';

    // Show reset password form
    res.send(`
      <html>
        <head>
          <title>Reset Password — GIDS</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <style>
            body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%); }
            .card { background: white; border-radius: 16px; padding: 40px; max-width: 440px; width: 90%; box-shadow: 0 8px 32px rgba(0,0,0,0.12); }
            .logo { text-align: center; margin-bottom: 20px; }
            .logo h2 { color: #1a1a8e; margin: 0; font-size: 1.3rem; }
            .logo p { color: #666; font-size: 0.8rem; margin: 4px 0 0; }
            h1 { font-size: 1.4rem; color: #111; text-align: center; margin-bottom: 8px; }
            p.sub { color: #555; text-align: center; font-size: 0.9rem; margin-bottom: 24px; }
            .field-group { margin-bottom: 16px; }
            label { display: block; font-size: 0.85rem; font-weight: 600; color: #333; margin-bottom: 4px; }
            input { width: 100%; padding: 12px 14px; border: 2px solid #d1d5db; border-radius: 8px; font-size: 0.95rem; box-sizing: border-box; transition: border-color 0.2s; }
            input:focus { outline: none; border-color: #1a1a8e; }
            .pw-wrap { position: relative; }
            .pw-toggle { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; font-size: 1.1rem; padding: 4px; }
            .btn { width: 100%; padding: 14px; background: #1a1a8e; color: white; border: none; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: background 0.2s; margin-top: 8px; }
            .btn:hover { background: #14147a; }
            .btn:disabled { opacity: 0.6; cursor: not-allowed; }
            .error { background: #fef2f2; color: #dc2626; padding: 10px 14px; border-radius: 8px; font-size: 0.85rem; margin-bottom: 16px; display: none; }
            .success { background: #f0fdf4; color: #16a34a; padding: 10px 14px; border-radius: 8px; font-size: 0.85rem; margin-bottom: 16px; display: none; text-align: center; }
            .hidden { display: none; }
            .login-link { text-align: center; margin-top: 20px; font-size: 0.85rem; }
            .login-link a { color: #1a1a8e; text-decoration: none; font-weight: 600; }
            .strength-bar { height: 4px; border-radius: 2px; margin-top: 4px; transition: all 0.2s; width: 0%; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="logo">
              <h2>Global India Digital Solution</h2>
              <p>Education · Training · Business</p>
            </div>
            <h1>Set New Password</h1>
            <p class="sub">Hi ${name}, enter your new password below.</p>

            <div id="reset-error" class="error"></div>
            <div id="reset-success" class="success">✅ Password updated successfully! Redirecting to login...</div>

            <div id="reset-form">
              <div class="field-group">
                <label>New Password</label>
                <div class="pw-wrap">
                  <input type="password" id="new-password" placeholder="Enter new password" oninput="checkStrength(this)" />
                  <button class="pw-toggle" onclick="togglePw('new-password', this)">👁</button>
                </div>
                <div id="strength-bar" class="strength-bar"></div>
                <div id="strength-text" style="font-size:0.75rem;color:#666;margin-top:4px;"></div>
              </div>
              <div class="field-group">
                <label>Confirm Password</label>
                <div class="pw-wrap">
                  <input type="password" id="confirm-password" placeholder="Repeat new password" />
                  <button class="pw-toggle" onclick="togglePw('confirm-password', this)">👁</button>
                </div>
              </div>
              <button class="btn" id="reset-btn" onclick="handleResetPassword()">Update Password →</button>
            </div>

            <div class="login-link">
              <a href="/">← Back to Login</a>
            </div>
          </div>

          <script>
            const RESET_TOKEN = ${JSON.stringify(token)};

            function togglePw(inputId, btn) {
              const input = document.getElementById(inputId);
              if (!input) return;
              if (input.type === 'password') {
                input.type = 'text';
                btn.textContent = '🔒';
              } else {
                input.type = 'password';
                btn.textContent = '👁';
              }
            }

            function checkStrength(input) {
              const val = input.value;
              const bar = document.getElementById('strength-bar');
              const text = document.getElementById('strength-text');
              let strength = 0;
              if (val.length >= 6) strength += 25;
              if (val.length >= 10) strength += 25;
              if (/[A-Z]/.test(val)) strength += 20;
              if (/[0-9]/.test(val)) strength += 15;
              if (/[^A-Za-z0-9]/.test(val)) strength += 15;
              bar.style.width = Math.min(strength, 100) + '%';
              if (strength < 30) { bar.style.background = '#dc2626'; text.textContent = 'Weak'; text.style.color = '#dc2626'; }
              else if (strength < 60) { bar.style.background = '#f59e0b'; text.textContent = 'Medium'; text.style.color = '#f59e0b'; }
              else if (strength < 85) { bar.style.background = '#16a34a'; text.textContent = 'Strong'; text.style.color = '#16a34a'; }
              else { bar.style.background = '#059669'; text.textContent = 'Very Strong'; text.style.color = '#059669'; }
              if (!val) { bar.style.width = '0%'; text.textContent = ''; }
            }

            async function handleResetPassword() {
              const password = document.getElementById('new-password').value;
              const confirm = document.getElementById('confirm-password').value;
              const errorEl = document.getElementById('reset-error');
              const successEl = document.getElementById('reset-success');
              const formEl = document.getElementById('reset-form');
              const btn = document.getElementById('reset-btn');

              errorEl.style.display = 'none';
              successEl.style.display = 'none';

              if (!password || !confirm) {
                errorEl.textContent = 'Please fill in both password fields.';
                errorEl.style.display = 'block';
                return;
              }

              if (password.length < 6) {
                errorEl.textContent = 'Password must be at least 6 characters.';
                errorEl.style.display = 'block';
                return;
              }

              if (password !== confirm) {
                errorEl.textContent = 'Passwords do not match.';
                errorEl.style.display = 'block';
                return;
              }

              btn.textContent = 'Updating...';
              btn.disabled = true;

              try {
                const response = await fetch('/api/reset-password', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ token: RESET_TOKEN, password, confirmPassword: confirm })
                });
                const data = await response.json();

                if (data.success) {
                  successEl.style.display = 'block';
                  formEl.style.display = 'none';
                  setTimeout(() => {
                    window.location.href = '/';
                  }, 3000);
                } else {
                  errorEl.textContent = data.message || 'Failed to reset password. Please try again.';
                  errorEl.style.display = 'block';
                  btn.textContent = 'Update Password →';
                  btn.disabled = false;
                }
              } catch (err) {
                errorEl.textContent = 'Could not connect to server. Please try again.';
                errorEl.style.display = 'block';
                btn.textContent = 'Update Password →';
                btn.disabled = false;
              }
            }
          </script>
        </body>
      </html>
    `);

  } catch (err) {
    console.error('Reset password page error:', err.message);
    res.status(500).send('<h1>Server Error</h1><p>Something went wrong. Please try again.</p>');
  }
});

// ============================================================
// RESET PASSWORD — POST /api/reset-password
// ============================================================
app.post('/api/reset-password', async (req, res) => {
  try {
    const { token, password, confirmPassword } = req.body;

    if (!token || !password || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }

    // Find user with valid reset token
    const userRes = await pool.query(
      'SELECT id, email FROM users WHERE reset_token = $1 AND reset_token_expires_at > NOW()',
      [token]
    );
    const user = userRes.rows;

    if (user.length === 0) {
      return res.status(400).json({ success: false, message: 'This reset link has expired. Please request a new one.' });
    }

    const foundUser = user[0];

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update password and clear reset token
    await pool.query(
      'UPDATE users SET password = $1, reset_token = NULL, reset_token_expires_at = NULL WHERE id = $2',
      [hashedPassword, foundUser.id]
    );

    console.log(`🔐 Password reset successful for user ${foundUser.email}`);

    res.json({ success: true, message: 'Password updated successfully!' });

  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ success: false, message: 'Server error. Could not reset password.' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

initDatabase()
  .then(() => {
    const server = app.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
      console.log('   Open this URL in your browser (do not open index.html directly)');
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use. Stop the existing process or change PORT in .env.`);
      } else {
        console.error('❌ Server failed to start:', err.message);
      }
      process.exit(1);
    });
  })
  .catch((err) => {
    console.error('❌ Database connection failed:', err.message);
    console.error('   Check MySQL is running and .env settings are correct.');
    process.exit(1);
  });