// api/auth/login.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookie = require('cookie'); // `cookie` Paket wurde hinzugefügt
const { checkRateLimit, recordFailedAttempt, resetAttempts, isAllowedIP } = require('../_middleware');

export default async function handler(req, res) {
  // CORS Headers (können in vercel.json auch global gesetzt werden, aber hier explizit)
  res.setHeader('Access-Control-Allow-Origin', '*'); // Oder spezifische Domain deines Frontends
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true'); // Wichtig für Cookies

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Umgebungsvariablen prüfen (Dies ist ein Debug-Schritt, den wir später optimieren)
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
  const jwtSecret = process.env.JWT_SECRET;
  const allowedIps = process.env.ALLOWED_IPS;

  if (!adminUsername || !adminPasswordHash || !jwtSecret) {
    console.error("Critical: Missing environment variables (ADMIN_USERNAME, ADMIN_PASSWORD_HASH, JWT_SECRET)");
    return res.status(500).json({ error: 'Server configuration error' });
  }
  if (!allowedIps) {
      console.warn("WARNING: ALLOWED_IPS is not set. IP Whitelist is disabled.");
  }


  const clientIP = req.headers['x-forwarded-for']?.split(',').shift().trim() || req.socket.remoteAddress;

  // IP Whitelist Check
  if (!isAllowedIP(clientIP)) {
    console.log(`Unauthorized IP attempt: ${clientIP}`);
    return res.status(403).json({ error: 'Access Denied: Your IP is not allowed.' });
  }

  // Rate Limiting
  if (!checkRateLimit(clientIP)) {
    console.log(`Rate limit exceeded for IP: ${clientIP}`);
    return res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
  }

  const { username, password } = req.body;

  try {
    const validUsername = username === adminUsername;
    const validPassword = await bcrypt.compare(password, adminPasswordHash);

    if (!validUsername || !validPassword) {
      recordFailedAttempt(clientIP);
      console.log(`Failed login attempt from IP: ${clientIP} with username: ${username}`);
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // Generate JWT Token
    const token = jwt.sign(
      {
        user: username,
        ip: clientIP,
        loginTime: Date.now()
      },
      jwtSecret,
      { expiresIn: '30m' } // Token gültig für 30 Minuten
    );

    // Reset failed attempts
    resetAttempts(clientIP);

    console.log(`Successful admin login from IP: ${clientIP} at ${new Date().toISOString()}`);

    // Set secure cookie
    res.setHeader('Set-Cookie', cookie.serialize('admin_token', token, {
      httpOnly: true,       // Nicht über JavaScript zugänglich
      secure: true,         // Nur über HTTPS senden
      sameSite: 'strict',   // Nur bei Anfragen von derselben Site senden
      maxAge: 60 * 30,      // 30 Minuten
      path: '/'             // Für die gesamte Domain gültig
    }));

    res.status(200).json({
      success: true,
      message: 'Login successful',
      expiresIn: 1800 // 30 minutes in seconds
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login process' });
  }
}
