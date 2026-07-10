const webpush = require('web-push');

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { subscription, title, body, data } = req.body;
  if (!subscription || !title || !body) {
    res.status(400).json({ error: 'Missing subscription, title, or body parameters.' });
    return;
  }

  // Setup VAPID keys
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

  if (!publicKey || !privateKey) {
    res.status(500).json({ error: 'Server VAPID keys are not configured.' });
    return;
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    const payload = JSON.stringify({ title, body, data });
    
    await webpush.sendNotification(subscription, payload, {
      TTL: 86400 // Time-To-Live in seconds: 24 hours
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Push notification failed:', error);
    res.status(500).json({ error: error.message || 'Failed to send notification.' });
  }
};
