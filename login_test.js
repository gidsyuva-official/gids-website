const http = require('http');
const email = process.argv[2] || 'gobiraj2005@gmail.com';
const password = process.argv[3] || 'testpass';

const data = JSON.stringify({ username: email, password });

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = http.request(options, (res) => {
  console.log('statusCode:', res.statusCode);
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('body:', body);
    process.exit(0);
  });
});
req.on('error', (err) => console.error('error:', err.message));
req.write(data);
req.end();
