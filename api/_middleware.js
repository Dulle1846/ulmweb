// api/_middleware.js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs'); // Nur wenn du es hier auch nutzen würdest, aktuell nicht
const NodeCache = require('node-cache'); // Import für Cache

// Cache für Login-Versuche (ersetzt einfaches Map-Objekt für Persistenz in Serverless)
// HINWEIS: Für echte Produktion sollte eine externe Datenbank wie Redis verwendet werden,
// da dieser Cache bei jedem Function-Warmup zurückgesetzt werden könnte.
const loginAttemptsCache = new NodeCache({ stdTTL: 900, checkperiod: 120 }); // TTL 15 Minuten

const MAX_ATTEMPTS = 3;
const LOCKOUT_TIME = 15 * 60 * 1000; // 15 Minuten

function checkRateLimit(ip) {
  const key = `login_attempts_${ip}`;
  let attempts = loginAttemptsCache.get(key) || { count: 0, lastAttempt: 0 };

  const now = Date.now();
  if (now - attempts.lastAttempt > LOCKOUT_TIME) {
    attempts.count = 0; // Reset nach Lockout-Zeit
  }

  if (attempts.count >= MAX_ATTEMPTS) {
    return false;
  }

  return true;
}

function recordFailedAttempt(ip) {
  const key = `login_attempts_${ip}`;
  let attempts = loginAttemptsCache.get(key) || { count: 0, lastAttempt: 0 };
  attempts.count++;
  attempts.lastAttempt = Date.now();
  loginAttemptsCache.set(key, attempts);
}

function resetAttempts(ip) {
  const key = `login_attempts_${ip}`;
  loginAttemptsCache.del(key);
}

// IP Whitelist Check
function isAllowedIP(ip) {
  const allowedIPsEnv = process.env.ALLOWED_IPS;
  if (!allowedIPsEnv) {
    console.warn("ALLOWED_IPS environment variable is not set. IP Whitelist is disabled.");
    return true; // Keine Whitelist konfiguriert, also alle IPs erlauben
  }
  const allowedIPs = allowedIPsEnv.split(',').map(s => s.trim());
  return allowedIPs.includes(ip) || allowedIPs.includes('*');
}

module.exports = {
  checkRateLimit,
  recordFailedAttempt,
  resetAttempts,
  isAllowedIP
};
