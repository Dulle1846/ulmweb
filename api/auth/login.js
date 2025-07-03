// 1. VERCEL SETUP
// Erstelle diese Dateien in deinem Repository:

// package.json
{
  "name": "ulmweb-admin",
  "version": "1.0.0",
  "scripts": {
    "dev": "vercel dev",
    "build": "echo 'Build complete'",
    "start": "vercel dev"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "cookie": "^0.5.0",
    "jsonwebtoken": "^9.0.0",
    "speakeasy": "^2.0.0",
    "qrcode": "^1.5.3"
  }
}

// vercel.json
{
  "functions": {
    "api/auth/login.js": {
      "maxDuration": 10
    },
    "api/admin/*.js": {
      "maxDuration": 30
    }
  },
  "env": {
    "ADMIN_USERNAME": "@admin_username",
    "ADMIN_PASSWORD_HASH": "@admin_password_hash",
    "JWT_SECRET": "@jwt_secret",
    "ALLOWED_IPS": "@allowed_ips"
  }
}

// .env.local (für lokale Entwicklung)
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=$2a$12$yourHashedPasswordHere
JWT_SECRET=your-super-secret-jwt-key-here
ALLOWED_IPS=your.ip.address.here,another.ip.if.needed

// 2. SICHERHEITS-MIDDLEWARE
// api/_middleware.js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Rate Limiting Storage (in production use Redis/Database)
const loginAttempts = new Map();
const MAX_ATTEMPTS = 3;
const LOCKOUT_TIME = 15 * 60 * 1000; // 15 Minuten

function checkRateLimit(ip) {
  const key = `login_${ip}`;
  const attempts = loginAttempts.get(key) || { count: 0, lastAttempt: 0 };
  
  const now = Date.now();
  if (now - attempts.lastAttempt > LOCKOUT_TIME) {
    attempts.count = 0;
  }
  
  if (attempts.count >= MAX_ATTEMPTS) {
    return false;
  }
  
  return true;
}

function recordFailedAttempt(ip) {
  const key = `login_${ip}`;
  const attempts = loginAttempts.get(key) || { count: 0, lastAttempt: 0 };
  attempts.count++;
  attempts.lastAttempt = Date.now();
  loginAttempts.set(key, attempts);
}

function resetAttempts(ip) {
  const key = `login_${ip}`;
  loginAttempts.delete(key);
}

// IP Whitelist Check
function isAllowedIP(ip) {
  const allowedIPs = process.env.ALLOWED_IPS?.split(',') || [];
  return allowedIPs.includes(ip) || allowedIPs.includes('*');
}

// CSRF Token Generation
function generateCSRFToken() {
  return require('crypto').randomBytes(32).toString('hex');
}

module.exports = {
  checkRateLimit,
  recordFailedAttempt,
  resetAttempts,
  isAllowedIP,
  generateCSRFToken
};

// 3. LOGIN API
// api/auth/login.js
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

    // TOTP Verification (if enabled)
    if (process.env.TOTP_SECRET) {
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

// 4. ADMIN DASHBOARD API
// api/admin/dashboard.js
const jwt = require('jsonwebtoken');
const { isAllowedIP } = require('../_middleware');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  
  // IP Check
  if (!isAllowedIP(clientIP)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Token verification
  const token = req.cookies?.admin_token || req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if token is from same IP
    if (decoded.ip !== clientIP) {
      console.log(`Token IP mismatch: ${decoded.ip} vs ${clientIP}`);
      return res.status(401).json({ error: 'Invalid session' });
    }

    // Log admin access
    console.log(`Admin dashboard accessed by ${decoded.user} from ${clientIP} at ${new Date().toISOString()}`);

    // Return dashboard data
    res.status(200).json({
      user: decoded.user,
      loginTime: decoded.loginTime,
      currentTime: Date.now(),
      stats: {
        // Add your website stats here
        visitors: 'N/A',
        lastUpdate: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
}

// 5. LOGOUT API
// api/auth/logout.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  console.log(`Admin logout from IP: ${clientIP} at ${new Date().toISOString()}`);

  // Clear cookie
  res.setHeader('Set-Cookie', 'admin_token=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/');
  
  res.status(200).json({ success: true, message: 'Logged out successfully' });
}

// 6. PASSWORD HASHER UTILITY
// utils/hashPassword.js
const bcrypt = require('bcryptjs');

async function hashPassword(password) {
  const salt = await bcrypt.genSalt(12);
  const hash = await bcrypt.hash(password, salt);
  console.log('Password hash:', hash);
  return hash;
}

// Beispiel: hashPassword('deinSicheresPassword123!');
module.exports = { hashPassword };
