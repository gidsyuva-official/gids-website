const mysql = require('mysql2/promise');
const email = process.argv[2] || 'gobiraj2005@gmail.com';
require('dotenv').config();

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'gids_database'
  });

  const [rows] = await conn.query('SELECT id, email, verification_token, expires_at, created_at FROM pending_users WHERE email = ?', [email]);
  console.log('Found:', rows.length);
  console.log(rows);
  await conn.end();
})();
