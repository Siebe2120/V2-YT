// api/intervals.js
export default async function handler(req, res) {
  const KEY = process.env.INTERVALS_API_KEY;
  const ATHLETE = process.env.INTERVALS_ATHLETE_ID; // e.g. "i123456"
  if (!KEY || !ATHLETE) {
    return res.status(500).json({ error: "Missing INTERVALS_API_KEY or INTERVALS_ATHLETE_ID" });
  }

  // intervals.icu uses HTTP Basic auth: username "API_KEY", password = your key
  const auth = "Basic " + Buffer.from(`API_KEY:${KEY}`).toString("base64");
  const base = `https://intervals.icu/api/v1/athlete/${ATHLETE}`;

  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 30);
  const fmt = (d) => d.toISOString().slice(0, 10);
  const oldest = fmt(from);
  const newest = fmt(today);

  try {
    const [wellnessRes, activitiesRes] = await Promise.all([
      fetch(`${base}/wellness?oldest=${oldest}&newest=${newest}`, { headers: { Authorization: auth } }),
      fetch(`${base}/activities?oldest=${oldest}&newest=${newest}`, { headers: { Authorization: auth } }),
    ]);

    if (!wellnessRes.ok || !activitiesRes.ok) {
      return res.status(502).json({
        error: "intervals.icu request failed",
        wellness: wellnessRes.status,
        activities: activitiesRes.status,
      });
    }

    const wellness = await wellnessRes.json();
    const activities = await activitiesRes.json();

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json({ wellness, activities });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
