const fetch = global.fetch || require('node-fetch');
const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

(async () => {
  try {
    console.log('Signing up test user...');
    const signupRes = await fetch('http://localhost:3000/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Flow',
        lastName: 'Tester',
        email: 'flowtest@example.com',
        phone: '1234567890',
        password: 'Password1',
        confirmPassword: 'Password1',
        role: 'Professional',
        agreeTerms: true
      })
    });
    const data = await signupRes.json();
    console.log('Signup response:', data);
    if (!data.success) return;

    // Token is emailed; for local test we will simply check pending_users table
    const pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'gids_database'
    });
    const res = await pool.query('SELECT * FROM pending_users WHERE email = $1', ['flowtest@example.com']);
    console.log('Pending users rows:', res.rows);

    await pool.end();
  } catch (err) {
    console.error('Test error:', err);
  }
})();
