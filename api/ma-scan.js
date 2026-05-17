// api/ma-scan.js
// Returns closing prices for MA calculation, or full OHLC for S&R finder

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const twelveKey = process.env.TWELVE_DATA_API_KEY;
  if (!twelveKey) return res.status(500).json({ error: 'Missing API key' });

  const { symbol, interval, outputsize, ohlc } = req.query;
  if (!symbol || !interval) return res.status(400).json({ error: 'Missing symbol or interval' });

  try {
    const size = outputsize || 120;
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${size}&apikey=${twelveKey}`;
    const r = await fetch(url);
    const d = await r.json();

    if (!d.values || d.values.length === 0) {
      return res.status(200).json({ closes: null, candles: null });
    }

    if (ohlc === 'true') {
      const candles = d.values.map(c => ({
        datetime: c.datetime,
        open:  parseFloat(c.open),
        high:  parseFloat(c.high),
        low:   parseFloat(c.low),
        close: parseFloat(c.close),
      }));
      return res.status(200).json({ candles });
    }

    const closes = d.values.map(c => parseFloat(c.close)).reverse();
    return res.status(200).json({ closes });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
