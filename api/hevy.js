// api/hevy.js
// Proxies GET /v1/workouts from the Hevy API so the browser never needs
// the API key. Requires a Hevy Pro subscription — get a key at
// hevy.com/settings?developer — and set it as HEVY_API_KEY on Vercel.
export default async function handler(req, res) {
  const KEY = process.env.HEVY_API_KEY;
  if (!KEY) {
    return res.status(500).json({ error: "Missing HEVY_API_KEY (Hevy Pro required — get a key at hevy.com/settings?developer)" });
  }

  try {
    const r = await fetch('https://api.hevyapp.com/v1/workouts?page=1&pageSize=10', {
      headers: { 'api-key': KEY, Accept: 'application/json' },
    });
    if (!r.ok) {
      return res.status(502).json({ error: 'Hevy request failed: ' + r.status + ' ' + (await r.text()) });
    }
    const data = await r.json();
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({ workouts: data.workouts || [] });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
