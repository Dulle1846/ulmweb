const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const { checkRateLimit, recordFailedAttempt, resetAttempts, isAllowedIP } = require('../_middleware');

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

  // IP Whitelist Check
  if (!isAllowedIP(clientIP)) {
    console.log(`Unauthorized IP attempt: ${clientIP}`);
    return res.status(403).json({ error: 'Access denied' });
  }

  // Rate Limiting
  if (!checkRateLimit(clientIP)) {
    console.log(`Rate limit exceeded for IP: ${clientIP}`);
    return res.status(429).json({ error: 'Too many attempts. Try again later.' });
  }

  const { username, password, totpCode } = req.body;

  try {
    // Validate credentials
    const validUsername = username === process.env.ADMIN_USERNAME;
    const validPassword = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);

    if (!validUsername || !validPassword) {
      recordFailedAttempt(clientIP);
      console.log(`Failed login attempt from IP: ${clientIP}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // TOTP Verification (if enabled) - WIR LASSEN DAS FÜR DEN MOMENT WEG
    if (process.env.TOTP_SECRET) { // DIESER BLOCK WIRD AKTUELL NICHT AUSGELÖST, DA DU KEIN TOTP_SECRET SETZT
      const verified = speakeasy.totp.verify({
        secret: process.env.TOTP_SECRET,
        encoding: 'base32',
        token: totpCode,
        window: 2
      });

      if (!verified) {
        recordFailedAttempt(clientIP);
        return res.status(401).json({ error: 'Invalid 2FA code' });
      }
    }

    // Generate JWT Token
    const token = jwt.sign(
      {
        user: username,
        ip: clientIP,
        loginTime: Date.now()
      },
      process.env.JWT_SECRET,
      { expiresIn: '30m' }
    );

    // Reset failed attempts
    resetAttempts(clientIP);

    // Log successful login
    console.log(`Successful admin login from IP: ${clientIP} at ${new Date().toISOString()}`);

    // Set secure cookie
    res.setHeader('Set-Cookie', `admin_token=${token}; HttpOnly; Secure; SameSite=Strict; Max-Age=1800; Path=/`);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      expiresIn: 1800 // 30 minutes
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}
