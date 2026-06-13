const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

(async () => {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'gids_database'
  });

  const [users] = await pool.query("SELECT id, full_name, username, email FROM users WHERE email = 'flowtest@example.com'");
  const [pending] = await pool.query("SELECT id, full_name, username, email FROM pending_users WHERE email = 'flowtest@example.com'");

  console.log('users:', users);
  console.log('pending:', pending);

  await pool.end();
})();
