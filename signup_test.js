const http = require('http');

const targetEmail = process.argv[2] || 'gobiraj2005@gmail.com';

const data = JSON.stringify({
  firstName: 'Test',
  lastName: 'User',
  email: targetEmail,
  phone: '9999999999',
  password: 'testpass',
  confirmPassword: 'testpass',
  role: 'Student',
  agreeTerms: true
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/signup',
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
    try {
      console.log('body:', JSON.parse(body));
    } catch (e) {
      console.log('body:', body);
    }
    process.exit(0);
  });
});

req.on('error', (err) => console.error('error:', err.message));
req.write(data);
req.end();
