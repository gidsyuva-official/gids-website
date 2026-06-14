const fetch = global.fetch || require('node-fetch');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

(async () => {
  try {
    console.log('Signing up test user...');
    const signupRes = await fetch('http://localhost:3000/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Flow Test User',
        username: 'flowtestuser',
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

    const token = data.magicLink ? data.magicLink.split('/').pop() : null;
    console.log('Extracted token:', token);

    const pool = await mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'gids_database'
    });
    const [rows] = await pool.query('SELECT * FROM pending_users WHERE email = ?', ['flowtest@example.com']);
    console.log('Pending users rows:', rows);

    if (token) {
      console.log('Verifying token...');
      const verifyRes = await fetch(`http://localhost:3000/verify/${token}`);
      const body = await verifyRes.text();
      console.log('Verify response status:', verifyRes.status);
      console.log('Verify response body:', body.slice(0, 500));
    }

    await pool.end();
  } catch (err) {
    console.error('Test error:', err);
  }
})();
