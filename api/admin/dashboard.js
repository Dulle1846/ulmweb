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
