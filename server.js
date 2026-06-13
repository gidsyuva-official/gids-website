'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
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

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'gids_database',
  waitForConnections: true,
  connectionLimit: 10
};

let pool;

async function ensureColumnExists(table, column, definition) {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbConfig.database, table, column]
  );

  if (rows.length === 0) {
    await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    console.log(`✅ Added missing column ${table}.${column}`);
  }
}

async function initDatabase() {
  const tempPool = mysql.createPool({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    waitForConnections: true,
    connectionLimit: 2
  });

  await tempPool.query(
    `CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\`
     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await tempPool.end();

  pool = mysql.createPool(dbConfig);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS consultations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      email VARCHAR(200) NOT NULL,
      phone VARCHAR(30) NOT NULL,
      service_interest VARCHAR(100) NOT NULL,
      message TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS enroll (
      id INT AUTO_INCREMENT PRIMARY KEY,
      full_name VARCHAR(150) NOT NULL,
      phone_number VARCHAR(30) NOT NULL,
      email_address VARCHAR(200) NOT NULL,
      learning_mode VARCHAR(50) NOT NULL,
      course_name VARCHAR(200) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reviews_table (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      email VARCHAR(255) NOT NULL,
      role VARCHAR(100) DEFAULT 'Learner',
      rating TINYINT NOT NULL,
      comment TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      first_name VARCHAR(100) NOT NULL,
      last_name VARCHAR(20) NOT NULL,
      login_name VARCHAR(120) NOT NULL,
      full_name VARCHAR(100) NULL,
      username VARCHAR(50) NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      phone VARCHAR(20) NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pending_users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      first_name VARCHAR(100) NOT NULL,
      last_name VARCHAR(20) NOT NULL,
      login_name VARCHAR(120) NOT NULL,
      full_name VARCHAR(100) NULL,
      username VARCHAR(50) NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(20) NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL,
      verification_token TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureColumnExists('users', 'first_name', 'VARCHAR(100) NULL');
  await ensureColumnExists('users', 'last_name', 'VARCHAR(20) NULL');
  await ensureColumnExists('users', 'login_name', 'VARCHAR(120) NULL');
  await ensureColumnExists('pending_users', 'first_name', 'VARCHAR(100) NULL');
  await ensureColumnExists('pending_users', 'last_name', 'VARCHAR(20) NULL');
  await ensureColumnExists('pending_users', 'login_name', 'VARCHAR(120) NULL');

  await pool.query(`
    UPDATE users
    SET
      first_name = COALESCE(NULLIF(first_name, ''), SUBSTRING_INDEX(full_name, ' ', 1)),
      last_name = COALESCE(NULLIF(last_name, ''), username),
      login_name = COALESCE(NULLIF(login_name, ''), username, CONCAT_WS(' ', first_name, last_name))
    WHERE (first_name IS NULL OR first_name = '' OR last_name IS NULL OR last_name = '' OR login_name IS NULL OR login_name = '')
      AND (full_name IS NOT NULL OR username IS NOT NULL)
  `);

  await pool.query(`
    UPDATE pending_users
    SET
      first_name = COALESCE(NULLIF(first_name, ''), SUBSTRING_INDEX(full_name, ' ', 1)),
      last_name = COALESCE(NULLIF(last_name, ''), username),
      login_name = COALESCE(NULLIF(login_name, ''), username, CONCAT_WS(' ', first_name, last_name))
    WHERE (first_name IS NULL OR first_name = '' OR last_name IS NULL OR last_name = '' OR login_name IS NULL OR login_name = '')
      AND (full_name IS NOT NULL OR username IS NOT NULL)
  `);

  console.log(`✅ MySQL connected — database: ${dbConfig.database}`);
}

// Nodemailer setup
let transporter;
let emailConfigured = false;
try {
  transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    tls: {
      rejectUnauthorized: false
    }
  });

  transporter.verify((verifyErr, success) => {
    if (verifyErr) {
      console.warn('⚠️ Nodemailer verification failed:', verifyErr.message);
      console.warn('   Check EMAIL_USER and EMAIL_PASS in .env and use a valid Gmail app password.');
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

// Book a Consultation — POST /api/contact
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, phone, service, message } = req.body;

    if (!name || !email || !phone || !service || !message) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    const [result] = await pool.query(
      `INSERT INTO consultations (name, email, phone, service_interest, message)
       VALUES (?, ?, ?, ?, ?)`,
      [name.trim(), email.trim(), phone.trim(), service.trim(), message.trim()]
    );

    res.json({
      success: true,
      message: 'Consultation booked successfully.',
      id: result.insertId
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

    const [result] = await pool.query(
      `INSERT INTO enroll (full_name, phone_number, email_address, learning_mode, course_name)
       VALUES (?, ?, ?, ?, ?)`,
      [name.trim(), phone.trim(), email.trim(), mode.trim(), course.trim()]
    );

    res.json({
      success: true,
      message: 'Enrollment saved successfully.',
      id: result.insertId
    });
  } catch (err) {
    console.error('Enroll error:', err.message);
    res.status(500).json({ success: false, message: 'Server error. Could not save enrollment.' });
  }
});

// Enrollment reports — counts by course and by date
app.get('/api/reports/enrollments', async (req, res) => {
  try {
    const [byCourse] = await pool.query(
      `SELECT course_name AS course, COUNT(*) AS count
       FROM enroll
       GROUP BY course_name
       ORDER BY count DESC`
    );
    const [byDate] = await pool.query(
      `SELECT DATE(created_at) AS date, COUNT(*) AS count
       FROM enroll
       GROUP BY DATE(created_at)
       ORDER BY DATE(created_at) DESC`
    );

    res.json({ success: true, byCourse, byDate });
  } catch (err) {
    console.error('Enrollment report error:', err.message);
    res.status(500).json({ success: false, message: 'Server error. Could not retrieve enrollment reports.' });
  }
});

// Consultation reports — counts by service and by date
app.get('/api/reports/consultations', async (req, res) => {
  try {
    const [byService] = await pool.query(
      `SELECT service_interest AS service, COUNT(*) AS count
       FROM consultations
       GROUP BY service_interest
       ORDER BY count DESC`
    );
    const [byDate] = await pool.query(
      `SELECT DATE(created_at) AS date, COUNT(*) AS count
       FROM consultations
       GROUP BY DATE(created_at)
       ORDER BY DATE(created_at) DESC`
    );

    res.json({ success: true, byService, byDate });
  } catch (err) {
    console.error('Consultation report error:', err.message);
    res.status(500).json({ success: false, message: 'Server error. Could not retrieve consultation reports.' });
  }
});

// Reviews list — GET /api/reviews
app.get('/api/reviews', async (req, res) => {
  try {
    const [reviews] = await pool.query(
      `SELECT id, name, email, role, rating, comment, created_at
       FROM reviews_table
       ORDER BY created_at DESC`
    );
    res.json({ success: true, reviews });
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

    const [result] = await pool.query(
      `INSERT INTO reviews_table (name, email, role, rating, comment)
       VALUES (?, ?, ?, ?, ?)`,
      [name.trim(), email.trim(), role ? role.trim() : 'Learner', parsedRating, comment.trim()]
    );

    res.json({ success: true, message: 'Review submitted successfully.', id: result.insertId });
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

    const [rows] = await pool.query(`SELECT email FROM reviews_table WHERE id = ?`, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Review not found.' });
    }

    const reviewOwner = rows[0].email;
    if (reviewOwner !== email.trim() && email.trim().toLowerCase() !== REVIEW_ADMIN_EMAIL) {
      return res.status(403).json({ success: false, message: 'Only the review author or admin may delete this review.' });
    }

    await pool.query(`DELETE FROM reviews_table WHERE id = ?`, [id]);
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
    const [existingUsers] = await pool.query('SELECT id FROM users WHERE email = ?', [email.trim()]);
    const [existingPending] = await pool.query('SELECT id FROM pending_users WHERE email = ?', [email.trim()]);
    if (existingUsers.length > 0 || existingPending.length > 0) {
      return res.status(400).json({ success: false, message: 'Email already registered. Please sign in or use a different email.' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const expiresMinutes = Number(process.env.VERIFY_LINK_EXPIRES_MINUTES) || 15;
    const expiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000);

    // Generate magic link
    const magicLink = `http://localhost:${PORT}/verify/${verificationToken}`;

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || !transporter) {
      return res.status(500).json({
        success: false,
        message: 'Email verification is not configured. Please contact the administrator to enable email delivery.'
      });
    }

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
    } catch (mailErr) {
      console.error('Verification email send failed:', mailErr.message);
      return res.status(500).json({
        success: false,
        message: 'Verification email could not be sent. Please check email configuration and try again.'
      });
    }

    // Save to pending_users after email is successfully queued
    await pool.query(`
      INSERT INTO pending_users (first_name, last_name, login_name, full_name, username, email, phone, password, role, verification_token, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [firstName.trim(), lastName.trim(), loginName, loginName, loginName, email.trim(), phone.trim(), hashedPassword, role.trim(), verificationToken, expiresAt]);

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
    const [pendingUsers] = await pool.query('SELECT * FROM pending_users WHERE verification_token = ?', [token]);

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
      await pool.query('DELETE FROM pending_users WHERE id = ?', [pendingUser.id]);
      return res.send('<h1>Verification Link Expired</h1><p>This link has expired. Please sign up again.</p>');
    }

    // Move user to users table
    await pool.query(`
      INSERT INTO users (first_name, last_name, login_name, full_name, username, email, phone, password, role)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [pendingUser.first_name, pendingUser.last_name, pendingUser.login_name, pendingUser.login_name, pendingUser.login_name, pendingUser.email, pendingUser.phone, pendingUser.password, pendingUser.role]);

    // Delete pending user
    await pool.query('DELETE FROM pending_users WHERE id = ?', [pendingUser.id]);

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

    const [users] = await pool.query('SELECT * FROM users WHERE login_name = ? OR username = ? OR email = ?', [identifier, identifier, identifier]);

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
