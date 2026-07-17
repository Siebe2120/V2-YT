// api/garmin.js
// Pulls Garmin Connect wellness metrics (Training Readiness, Body Battery,
// Training Status, HRV, Sleep) via the UNOFFICIAL Garmin Connect API —
// Garmin has no self-serve public API for individuals, so this logs in
// with your real Garmin Connect credentials the same way tools like
// Home Assistant's Garmin integration do. See SETUP.md before enabling:
// this stores your actual account password as a server secret, not a
// revocable scoped token like the other integrations in this project.
//
// Env vars required on Vercel:
//   GARMIN_EMAIL
//   GARMIN_PASSWORD
// Loaded lazily inside the handler (not a top-level import) so that if the
// package fails to load — e.g. a bundling issue — it surfaces as a normal
// JSON error response instead of crashing the function before our own
// try/catch ever runs (which shows up to the browser as Vercel's generic
// "A server error has occurred" HTML page instead of useful JSON).
let GarminConnect = null;
async function loadLib() {
  if (GarminConnect) return GarminConnect;
  const mod = await import('@gooin/garmin-connect');
  GarminConnect = (mod.default || mod).GarminConnect;
  if (!GarminConnect) throw new Error('garmin-connect module loaded but GarminConnect export not found');
  return GarminConnect;
}

// Reuse a logged-in client across warm serverless invocations so we're
// not hitting Garmin's login endpoint on every page load/refresh.
let cachedClient = null;
let cachedAt = 0;
const SESSION_TTL_MS = 10 * 60 * 1000;

async function getClient() {
  const email = process.env.GARMIN_EMAIL;
  const password = process.env.GARMIN_PASSWORD;
  if (!email || !password) throw new Error('Missing GARMIN_EMAIL/GARMIN_PASSWORD');

  if (cachedClient && Date.now() - cachedAt < SESSION_TTL_MS) return cachedClient;

  const Client = await loadLib();
  const client = new Client({ username: email, password });
  await client.login();
  cachedClient = client;
  cachedAt = Date.now();
  return client;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  try {
    const client = await getClient();
    const date = todayStr();

    // Fetched raw and parsed client-side — these are reverse-engineered,
    // undocumented endpoints, so exact field names in each payload aren't
    // 100% guaranteed. Returning the raw shape keeps a mismatch from
    // silently breaking the whole card instead of just one stat.
    const [readiness, bodyBattery, trainingStatus, hrv, sleep] = await Promise.all([
      client.get(`/metrics-service/metrics/trainingreadiness/${date}`).catch(() => null),
      client.get(`/wellness-service/wellness/bodyBattery/reports/daily?startDate=${date}&endDate=${date}`).catch(() => null),
      client.get(`/metrics-service/metrics/trainingstatus/aggregated/${date}`).catch(() => null),
      client.get(`/hrv-service/hrv/${date}`).catch(() => null),
      client.getSleepData(date).catch(() => null),
    ]);

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({ date, readiness, bodyBattery, trainingStatus, hrv, sleep });
  } catch (e) {
    // Session may have gone stale — force a fresh login attempt next time.
    cachedClient = null;
    return res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
}
