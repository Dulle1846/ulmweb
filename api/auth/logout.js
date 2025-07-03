// api/auth/logout.js
const cookie = require('cookie');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const clientIP = req.headers['x-forwarded-for']?.split(',').shift().trim() || req.socket.remoteAddress;
  console.log(`Admin logout request from IP: ${clientIP} at ${new Date().toISOString()}`);

  // Clear cookie
  res.setHeader('Set-Cookie', cookie.serialize('admin_token', '', {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 0, // Cookie sofort ungültig machen
    path: '/'
  }));

  res.status(200).json({ success: true, message: 'Logged out successfully' });
}
