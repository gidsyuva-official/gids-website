'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const validator = require('validator');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// PostgreSQL connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'gids_database',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize database tables
async function initDatabase() {
  try {
    // Create consultations table
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

    // Create enroll table
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

    // Create reviews table
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

    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(20) NOT NULL,
        login_name VARCHAR(120) NOT NULL,
        full_name VARCHAR(100),
        username VARCHAR(50),
        email VARCHAR(255) NOT NULL UNIQUE,
        phone VARCHAR(20) NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create pending_users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pending_users (
        id SERIAL PRIMARY KEY,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(20) NOT NULL,
        login_name VARCHAR(120) NOT NULL,
        full_name VARCHAR(100),
        username VARCHAR(50),
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        verification_token TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ PostgreSQL connected and tables initialized (v2)');
  } catch (err) {
    console.error('❌ Database initialization failed:', err.message);
  }
}

// Nodemailer setup
let transporter;
let emailConfigured = false;
const emailUser = process.env.EMAIL_USER;
const emailPass = process.env.EMAIL_PASS;
console.log(`NODE_ENV=${process.env.NODE_ENV || 'undefined'}`);
console.log(`RENDER_EXTERNAL_URL=${process.env.RENDER_EXTERNAL_URL || 'undefined'}`);
console.log(`EMAIL_USER is ${emailUser ? 'set' : 'NOT set'}`);
console.log(`EMAIL_PASS is ${emailPass ? 'set' : 'NOT set'}`);
if (!emailUser || !emailPass) {
  console.warn('⚠️ EMAIL_USER or EMAIL_PASS is missing. Verification emails cannot be sent until these are configured.');
} else {
  try {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: emailUser,
        pass: emailPass
      }
    });

    transporter.verify((verifyErr, success) => {
      if (verifyErr) {
        console.warn('⚠️ Nodemailer verification failed:', verifyErr.message);
        console.warn('   Check EMAIL_USER and EMAIL_PASS in Render dashboard or .env and use a valid Gmail app password from the same account.');
        emailConfigured = false;
      } else {
        console.log('✅ Nodemailer configured and ready to send email');
        emailConfigured = true;
      }
    });
  } catch (err) {
    console.warn('⚠️ Nodemailer not configured - verification emails will not work');
    console.warn(err.message);
    emailConfigured = false;
  }
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
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [name.trim(), email.trim(), phone.trim(), service.trim(), message.trim()]
    );

    res.json({
      success: true,
      message: 'Consultation booked successfully.',
      id: result.rows[0].id
    });
  } catch (err) {
    console.error('Contact error:', err.message);
    res.status(500).json({ success: false, message: 'Server error. Could not save consultation.' });
  }
});

// Enroll — POST /api/enroll
app.post('/api/enroll', async (req, res) => {
  try {
    const { name, phone, email, course, mode } = req.body;

    if (!name || !phone || !email || !course || !mode) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    const result = await pool.query(
      `INSERT INTO enroll (full_name, phone_number, email_address, learning_mode, course_name)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [name.trim(), phone.trim(), email.trim(), mode.trim(), course.trim()]
    );

    res.json({
      success: true,
      message: 'Enrollment saved successfully.',
      id: result.rows[0].id
    });
  } catch (err) {
    console.error('Enroll error:', err.message);
    res.status(500).json({ success: false, message: 'Server error. Could not save enrollment.' });
  }
});

// Enrollment reports — counts by course and by date
app.get('/api/reports/enrollments', async (req, res) => {
  try {
    const byCourseResult = await pool.query(
      `SELECT course_name AS course, COUNT(*) AS count
       FROM enroll
       GROUP BY course_name
       ORDER BY count DESC`
    );

    const byDateResult = await pool.query(
      `SELECT DATE(created_at) AS date, COUNT(*) AS count
       FROM enroll
       GROUP BY DATE(created_at)
       ORDER BY DATE(created_at) DESC`
    );

    res.json({ success: true, byCourse: byCourseResult.rows, byDate: byDateResult.rows });
  } catch (err) {
    console.error('Enrollment report error:', err.message);
    res.status(500).json({ success: false, message: 'Server error. Could not retrieve enrollment reports.' });
  }
});

// Consultation reports — counts by service and by date
app.get('/api/reports/consultations', async (req, res) => {
  try {
    const byServiceResult = await pool.query(
      `SELECT service_interest AS service, COUNT(*) AS count
       FROM consultations
       GROUP BY service_interest
       ORDER BY count DESC`
    );

    const byDateResult = await pool.query(
      `SELECT DATE(created_at) AS date, COUNT(*) AS count
       FROM consultations
       GROUP BY DATE(created_at)
       ORDER BY DATE(created_at) DESC`
    );

    res.json({ success: true, byService: byServiceResult.rows, byDate: byDateResult.rows });
  } catch (err) {
    console.error('Consultation report error:', err.message);
    res.status(500).json({ success: false, message: 'Server error. Could not retrieve consultation reports.' });
  }
});

// Reviews list — GET /api/reviews
app.get('/api/reviews', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, role, rating, comment, created_at
       FROM reviews_table
       ORDER BY created_at DESC`
    );
    res.json({ success: true, reviews: result.rows });
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
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [name.trim(), email.trim(), role ? role.trim() : 'Learner', parsedRating, comment.trim()]
    );

    res.json({ success: true, message: 'Review submitted successfully.', id: result.rows[0].id });
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

    const result = await pool.query(`SELECT email FROM reviews_table WHERE id = $1`, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Review not found.' });
    }

    const reviewOwner = result.rows[0].email;
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
    const existingUsersResult = await pool.query('SELECT id FROM users WHERE email = $1', [email.trim()]);
    const existingPendingResult = await pool.query('SELECT id FROM pending_users WHERE email = $1', [email.trim()]);
    if (existingUsersResult.rows.length > 0 || existingPendingResult.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'Email already registered. Please sign in or use a different email.' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const expiresMinutes = Number(process.env.VERIFY_LINK_EXPIRES_MINUTES) || 15;
    const expiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000);

    // Generate magic link
    const magicLink = `${process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`}/verify/${verificationToken}`;

    // Try to send email. IMPORTANT: do NOT create the account if email fails
    // because verification is required for access.
    let emailSent = false;
    if (!emailConfigured) {
      console.error('❌ Email is not configured on this server. Aborting signup to enforce verification.');
      return res.status(500).json({ success: false, message: 'Verification email could not be sent. Please check email configuration and try again.' });
    }

    if (process.env.EMAIL_USER && process.env.EMAIL_PASS && transporter) {
      const mailOptions = {
        from: `"GIDS Verification" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Verify your GIDS account',
        replyTo: process.env.EMAIL_USER,
        text: `Welcome to Global India Digital Solution!\n\nHi ${firstName || loginName},\n\nClick the link below to verify your account:\n${magicLink}\n\nThis link expires in ${expiresMinutes} minutes.\n\nIf you didn't create this account, ignore this message.`,
        html: `
          <h1>Welcome to Global India Digital Solution!</h1>
          <p>Hi ${firstName || loginName},</p>
          <p>Click the link below to verify your account:</p>
          <a href="${magicLink}" style="font-size: 18px; padding: 10px 20px; background: #1a1a8e; color: white; text-decoration: none; border-radius: 5px;">Verify Account</a>
          <p>This link expires in ${expiresMinutes} minutes.</p>
          <p>If you didn't create this account, you can ignore this email.</p>
        `
      };

      try {
        let sendInfo;
        await new Promise((resolve, reject) => {
          transporter.sendMail(mailOptions, (mailErr, info) => {
            if (mailErr) {
              return reject(mailErr);
            }
            if (info && info.rejected && info.rejected.length > 0) {
              return reject(new Error(`Email rejected by SMTP server: ${info.rejected.join(', ')}`));
            }
            sendInfo = info;
            resolve(info);
          });
        });
        console.log(`📧 Verification email sent to ${email}`);
        console.log('Mail send info:', sendInfo && typeof sendInfo === 'object' ? JSON.stringify(sendInfo) : sendInfo);
        emailSent = true;
      } catch (mailErr) {
        console.error('❌ Verification email send failed:', mailErr && mailErr.message ? mailErr.message : mailErr);
        console.error('Full error:', mailErr);
        // DO NOT create the account automatically — enforce verification.
        return res.status(500).json({ success: false, message: 'Verification email could not be sent. Please check email configuration and try again.' });
      }
    }

    if (emailSent) {
      // Save to pending_users after email is successfully queued
      await pool.query(`
        INSERT INTO pending_users (first_name, last_name, login_name, full_name, username, email, phone, password, role, verification_token, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [firstName.trim(), lastName.trim(), loginName, loginName, loginName, email.trim(), phone.trim(), hashedPassword, role.trim(), verificationToken, expiresAt]);

      const responsePayload = {
        success: true,
        message: 'Verification email sent to your address. Please check your inbox and click the verification link to complete your registration.'
      };

      console.log('Signup route success response (email sent):', responsePayload);
      res.json(responsePayload);
    }

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
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { token } = req.params;

    // Find pending user
    const pendingResult = await client.query('SELECT * FROM pending_users WHERE verification_token = $1', [token]);

    if (pendingResult.rows.length === 0) {
      await client.query('ROLLBACK');
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

    const pendingUser = pendingResult.rows[0];

    // Check if token expired
    if (new Date() > new Date(pendingUser.expires_at)) {
      // Delete expired pending user
      await client.query('DELETE FROM pending_users WHERE id = $1', [pendingUser.id]);
      await client.query('COMMIT');
      return res.send('<h1>Verification Link Expired</h1><p>This link has expired. Please sign up again.</p>');
    }

    // Move user to users table
    await client.query(`
      INSERT INTO users (first_name, last_name, login_name, full_name, username, email, phone, password, role)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [pendingUser.first_name, pendingUser.last_name, pendingUser.login_name, pendingUser.login_name, pendingUser.login_name, pendingUser.email, pendingUser.phone, pendingUser.password, pendingUser.role]);

    // Delete pending user
    await client.query('DELETE FROM pending_users WHERE id = $1', [pendingUser.id]);

    await client.query('COMMIT');

    // Create JWT token
    const jwtToken = jwt.sign({ id: pendingUser.id, email: pendingUser.email }, process.env.JWT_SECRET || 'fallback-secret-change-in-production', { expiresIn: '7d' });
    const fullName = `${pendingUser.first_name || ''} ${pendingUser.last_name || ''}`.trim() || pendingUser.login_name;

    const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

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
            window.location.href = '${baseUrl}/';
            setTimeout(() => {
              window.location.href = '${baseUrl}/';
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
    await client.query('ROLLBACK');
    console.error('Verification error:', err.message);
    res.status(500).send('<h1>Server Error</h1><p>Something went wrong during verification.</p>');
  } finally {
    client.release();
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

    const result = await pool.query('SELECT * FROM users WHERE login_name = $1 OR username = $1 OR email = $1', [identifier]);

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    if (result.rows.length > 1 && !validator.isEmail(identifier)) {
      return res.status(400).json({ success: false, message: 'Multiple users found with this name. Please sign in using your email address.' });
    }

    const user = result.rows[0];
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
    console.error('   Check PostgreSQL is running and .env settings are correct.');
    process.exit(1);
  });
