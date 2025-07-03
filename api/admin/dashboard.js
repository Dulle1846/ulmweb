// api/admin/dashboard.js
const jwt = require('jsonwebtoken');
const cookie = require('cookie'); // `cookie` Paket wurde hinzugefügt
const { isAllowedIP } = require('../_middleware');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Umgebungsvariablen prüfen
  const jwtSecret = process.env.JWT_SECRET;
  const allowedIps = process.env.ALLOWED_IPS;

  if (!jwtSecret) {
    console.error("Critical: Missing environment variable (JWT_SECRET)");
    return res.status(500).json({ error: 'Server configuration error' });
  }
  if (!allowedIps) {
      console.warn("WARNING: ALLOWED_IPS is not set. IP Whitelist is disabled.");
  }


  const clientIP = req.headers['x-forwarded-for']?.split(',').shift().trim() || req.socket.remoteAddress;

  // IP Check
  if (!isAllowedIP(clientIP)) {
    console.log(`Unauthorized IP access to dashboard: ${clientIP}`);
    return res.status(403).json({ error: 'Access Denied: Your IP is not allowed.' });
  }

  // Token verification
  const cookies = cookie.parse(req.headers.cookie || '');
  const token = cookies.admin_token;

  if (!token) {
    return res.status(401).json({ error: 'No authentication token provided.' });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);

    // Check if token is from same IP (optional, aber erhöht Sicherheit)
    if (decoded.ip !== clientIP) {
      console.log(`Token IP mismatch for user ${decoded.user}: ${decoded.ip} vs ${clientIP}`);
      return res.status(401).json({ error: 'Invalid session. IP mismatch.' });
    }

    console.log(`Admin dashboard accessed by ${decoded.user} from ${clientIP} at ${new Date().toISOString()}`);

    // Return dashboard data
    res.status(200).json({
      user: decoded.user,
      loginTime: decoded.loginTime,
      currentTime: Date.now(),
      stats: {
        visitors: Math.floor(Math.random() * 10000) + 1000, // Beispielwerte
        lastUpdate: new Date().toLocaleString('de-DE')
      }
    });

  } catch (error) {
    console.error('Token verification error:', error);
    // Je nach Fehlertyp kann man spezifischer sein:
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    } else if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid authentication token.' });
    }
    res.status(500).json({ error: 'Server error during dashboard access.' });
  }
}
