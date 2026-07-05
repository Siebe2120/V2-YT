// ============================================================
// GET /api/outlook-callback?code=...&state=...
// Receives the OAuth code from Microsoft, exchanges it for tokens,
// and bounces back to /schedule.html with the tokens in the URL
// hash. The hash never reaches the server — only the browser
// reads it, then stores the tokens in localStorage.
// Env vars required on Vercel:
//   OUTLOOK_CLIENT_ID
//   OUTLOOK_CLIENT_SECRET
// ============================================================
export default async function handler(req, res) {
  const code = req.query && req.query.code;
  const errorParam = req.query && req.query.error;
  if (errorParam) return res.status(400).send('Outlook auth error: ' + errorParam);
  if (!code) return res.status(400).send('Missing code parameter.');

  const clientId     = process.env.OUTLOOK_CLIENT_ID;
  const clientSecret = process.env.OUTLOOK_CLIENT_SECRET;
  // Derive the redirect from the live host so it always matches the
  // redirect_uri used at the authorize step, regardless of domain.
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const host  = req.headers['x-forwarded-host'] || req.headers.host;
  const redirectUri = proto + '://' + host + '/api/outlook-callback';
  if (!clientId || !clientSecret) {
    return res.status(500).send('Server not configured (missing OUTLOOK_CLIENT_ID / OUTLOOK_CLIENT_SECRET).');
  }

  try {
    const body = new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      redirect_uri:  redirectUri,
      client_id:     clientId,
      client_secret: clientSecret,
      scope:         'offline_access Calendars.Read',
    });
    const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const text = await tokenRes.text();
    if (!tokenRes.ok) {
      return res.status(500).send('Outlook token exchange failed: ' + text);
    }
    let json;
    try { json = JSON.parse(text); } catch (e) {
      return res.status(500).send('Outlook returned non-JSON: ' + text);
    }
    const access = json.access_token || '';
    const refresh = json.refresh_token || '';
    const expiresIn = json.expires_in || 3600;
    const hash = new URLSearchParams({
      outlook_access:  access,
      outlook_refresh: refresh,
      outlook_expires: String(Date.now() + expiresIn * 1000),
    }).toString();
    res.writeHead(302, { Location: '/schedule.html#' + hash });
    res.end();
  } catch (e) {
    res.status(500).send('Unexpected error: ' + (e && e.message ? e.message : String(e)));
  }
}
