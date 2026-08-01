import { Router } from 'express';

export const iceRouter = Router();

// Fetches fresh, short-lived TURN credentials from Twilio on demand, so
// the client never hardcodes a credential that can expire. Twilio's
// Account SID/Auth Token stay server-side only — never sent to the browser.
iceRouter.get('/', async (req, res) => {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;

  if (!sid || !token) {
    // No Twilio configured — fall back to public STUN only. Direct
    // connections still work on simple networks; just no TURN relay.
    return res.json({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
  }

  try {
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const twilioRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Tokens.json`,
      { method: 'POST', headers: { Authorization: `Basic ${auth}` } }
    );
    if (!twilioRes.ok) throw new Error(`twilio_${twilioRes.status}`);
    const data = await twilioRes.json();

    const iceServers = data.ice_servers.map((s) => ({
      urls: s.urls || s.url,
      username: s.username,
      credential: s.credential,
    }));

    res.json({ iceServers });
  } catch (err) {
    console.error('Failed to fetch Twilio ICE servers:', err);
    res.json({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
  }
});