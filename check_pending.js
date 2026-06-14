const { Pool } = require('pg');
const email = process.argv[2] || 'gobiraj2005@gmail.com';
require('dotenv').config();

(async () => {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'gids_database'
  });

  const res = await pool.query('SELECT id, email, verification_token, expires_at, created_at FROM pending_users WHERE email = $1', [email]);
  console.log('Found:', res.rows.length);
  console.log(res.rows);
  await pool.end();
})();
