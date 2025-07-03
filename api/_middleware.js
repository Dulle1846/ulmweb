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

// CSRF Token Generation (Aktuell nicht voll genutzt, aber Teil des Backends)
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
