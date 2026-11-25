import { onRequest } from 'firebase-functions/v2/https';

export const getServerTime = onRequest({ cors: true }, (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.status(200).json({ now: Date.now() });
});
