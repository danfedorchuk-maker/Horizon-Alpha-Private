// api/ma-scan.js
// Returns closing prices for MA calculation — used by the scanner

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const twelveKey = process.env.TWELVE_DATA_API_KEY;
  if (!twelveKey) return res.status(500).json({ error: 'Missing API key' });

  const { symbol, interval } = req.query;
  if (!symbol || !interval) return res.status(400).json({ error: 'Missing symbol or interval' });

  try {
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=120&apikey=${twelveKey}`;
    const r = await fetch(url);
    const d = await r.json();

    if (!d.values || d.values.length === 0) {
      return res.status(200).json({ closes: null });
    }

    const closes = d.values.map(c => parseFloat(c.close)).reverse();
    return res.status(200).json({ closes });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
