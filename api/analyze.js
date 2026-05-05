// api/analyze.js — Horizon Alpha Private
// Real price data from Twelve Data + Real COT from CFTC + Groq analysis

const handler = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ result: "Method not allowed." });

  const groqKey   = process.env.GROQ_API_KEY;
  const twelveKey = process.env.TWELVE_DATA_API_KEY;
  if (!groqKey)   return res.status(200).json({ result: "SYSTEM ERROR: GROQ_API_KEY missing." });
  if (!twelveKey) return res.status(200).json({ result: "SYSTEM ERROR: TWELVE_DATA_API_KEY missing." });

  const { word: asset, tradition: pillar } = req.body || {};
  if (!asset) return res.status(200).json({ result: "SYSTEM ERROR: No asset specified." });

  // ── 1. REAL PRICE DATA FROM TWELVE DATA ──────────────────────────────────────

  let priceContext = "";
  let fibContext   = "";

  try {
    const symbolMap = {
      "AUD/USD":"AUD/USD","EUR/USD":"EUR/USD","GBP/USD":"GBP/USD","NZD/USD":"NZD/USD",
      "USD/CAD":"USD/CAD","USD/CHF":"USD/CHF","USD/JPY":"USD/JPY","AUD/CAD":"AUD/CAD",
      "AUD/CHF":"AUD/CHF","AUD/JPY":"AUD/JPY","AUD/NZD":"AUD/NZD","CAD/CHF":"CAD/CHF",
      "CAD/JPY":"CAD/JPY","CHF/JPY":"CHF/JPY","EUR/AUD":"EUR/AUD","EUR/CAD":"EUR/CAD",
      "EUR/CHF":"EUR/CHF","EUR/GBP":"EUR/GBP","EUR/JPY":"EUR/JPY","EUR/NZD":"EUR/NZD",
      "GBP/AUD":"GBP/AUD","GBP/CAD":"GBP/CAD","GBP/CHF":"GBP/CHF","GBP/JPY":"GBP/JPY",
      "GBP/NZD":"GBP/NZD","NZD/CAD":"NZD/CAD","NZD/CHF":"NZD/CHF","NZD/JPY":"NZD/JPY",
      "XAU/USD":"XAU/USD","BTC/USD":"BTC/USD","ETH/USD":"ETH/USD",
      "WTI CRUDE OIL":"WTI/USD","COPPER":"COPPER/USD",
      "S&P 500 (SPX)":"SPX","NASDAQ 100 (NDX)":"NDX","DOW JONES (DJI)":"DJI",
      "RUSSELL 2000 (RUT)":"RUT","NIKKEI 225 (NI225)":"NI225",
      "DAX 40 (DAX)":"DAX","VIX (THE FEAR GAUGE)":"VIX","S&P/TSX COMPOSITE":"TSX"
    };

    const symbol = symbolMap[asset] || asset;
    const tdUrl  = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=90&apikey=${twelveKey}`;
    const tdRes  = await fetch(tdUrl);
    const tdData = await tdRes.json();

    if (tdData.values && tdData.values.length > 0) {
      const candles   = tdData.values;
      const current   = parseFloat(candles[0].close);
      const prices    = candles.map(c => parseFloat(c.close));
      const highs     = candles.map(c => parseFloat(c.high));
      const lows      = candles.map(c => parseFloat(c.low));
      const swingHigh = Math.max(...highs);
      const swingLow  = Math.min(...lows);
      const range     = swingHigh - swingLow;
      const fib236    = swingHigh - range * 0.236;
      const fib382    = swingHigh - range * 0.382;
      const fib500    = swingHigh - range * 0.500;
      const fib618    = swingHigh - range * 0.618;
      const fib786    = swingHigh - range * 0.786;
      const high7     = Math.max(...candles.slice(0,7).map(c => parseFloat(c.high)));
      const low7      = Math.min(...candles.slice(0,7).map(c => parseFloat(c.low)));
      const change7   = ((current - prices[6]) / prices[6] * 100).toFixed(2);
      const trend     = current > prices[6] ? "BULLISH" : "BEARISH";
      const dp        = current > 10 ? 2 : current > 1 ? 4 : 5;
      const fmt       = n => n.toFixed(dp);

      priceContext = `
LIVE MARKET DATA (Source: Twelve Data — ${candles[0].datetime})
Asset: ${asset} | Current Price: ${fmt(current)}
7-Day High: ${fmt(high7)} | 7-Day Low: ${fmt(low7)} | 7-Day Change: ${change7}% | Bias: ${trend}
90-Day Swing High: ${fmt(swingHigh)} | 90-Day Swing Low: ${fmt(swingLow)}`;

      fibContext = `
REAL FIBONACCI LEVELS (from 90-day swing high/low — exact, not estimated)
Swing High: ${fmt(swingHigh)} | Swing Low: ${fmt(swingLow)}
23.6%: ${fmt(fib236)} | 38.2%: ${fmt(fib382)} | 50.0%: ${fmt(fib500)} | 61.8%: ${fmt(fib618)} | 78.6%: ${fmt(fib786)}
Price is ${current > fib500 ? "ABOVE" : "BELOW"} the 50% level.
Nearest Support: ${current > fib500 ? fmt(fib500) : fmt(fib618)} | Nearest Resistance: ${current > fib500 ? fmt(fib382) : fmt(fib500)}`;
    } else {
      priceContext = `Live price data unavailable for ${asset}. Use general price context.`;
      fibContext   = `Fibonacci levels unavailable. Provide general structural analysis.`;
    }
  } catch (err) {
    priceContext = `Price fetch failed: ${err.message}`;
    fibContext   = `Fibonacci unavailable.`;
  }

  // ── 2. REAL COT DATA FROM CFTC ────────────────────────────────────────────────

  let cotContext = "";

  const cotMap = {
    "EUR/USD":       ["EURO FX"],
    "GBP/USD":       ["BRITISH POUND"],
    "USD/JPY":       ["JAPANESE YEN"],
    "USD/CHF":       ["SWISS FRANC"],
    "USD/CAD":       ["CANADIAN DOLLAR"],
    "AUD/USD":       ["AUSTRALIAN DOLLAR"],
    "NZD/USD":       ["NEW ZEALAND DOLLAR"],
    "XAU/USD":       ["GOLD"],
    "WTI CRUDE OIL": ["CRUDE OIL"],
    "S&P 500 (SPX)": ["S&P 500"],
    "BTC/USD":       ["BITCOIN"],
    "GBP/JPY":  ["BRITISH POUND", "JAPANESE YEN"],
    "EUR/JPY":  ["EURO FX", "JAPANESE YEN"],
    "GBP/AUD":  ["BRITISH POUND", "AUSTRALIAN DOLLAR"],
    "EUR/GBP":  ["EURO FX", "BRITISH POUND"],
    "AUD/JPY":  ["AUSTRALIAN DOLLAR", "JAPANESE YEN"],
    "EUR/AUD":  ["EURO FX", "AUSTRALIAN DOLLAR"],
    "GBP/CHF":  ["BRITISH POUND", "SWISS FRANC"],
    "EUR/CHF":  ["EURO FX", "SWISS FRANC"],
    "CAD/JPY":  ["CANADIAN DOLLAR", "JAPANESE YEN"],
    "NZD/JPY":  ["NEW ZEALAND DOLLAR", "JAPANESE YEN"],
    "CHF/JPY":  ["SWISS FRANC", "JAPANESE YEN"],
    "GBP/CAD":  ["BRITISH POUND", "CANADIAN DOLLAR"],
    "EUR/CAD":  ["EURO FX", "CANADIAN DOLLAR"],
    "AUD/NZD":  ["AUSTRALIAN DOLLAR", "NEW ZEALAND DOLLAR"],
    "AUD/CAD":  ["AUSTRALIAN DOLLAR", "CANADIAN DOLLAR"],
    "GBP/NZD":  ["BRITISH POUND", "NEW ZEALAND DOLLAR"],
    "EUR/NZD":  ["EURO FX", "NEW ZEALAND DOLLAR"],
    "NZD/CAD":  ["NEW ZEALAND DOLLAR", "CANADIAN DOLLAR"],
    "NZD/CHF":  ["NEW ZEALAND DOLLAR", "SWISS FRANC"],
    "AUD/CHF":  ["AUSTRALIAN DOLLAR", "SWISS FRANC"],
    "CAD/CHF":  ["CANADIAN DOLLAR", "SWISS FRANC"],
  };

  // Legacy COT columns (f_leg.txt):
  // 0=market_name, 1=exchange, 2=cftc_code, 3=report_date
  // 4=open_interest, 5=noncomm_long, 6=noncomm_short, 7=noncomm_spread
  // 8=comm_long, 9=comm_short, 10=total_long, 11=total_short
  function parseCOT(cotText, keyword) {
    const lines = cotText.split('\n');
    const kw = keyword.toLowerCase();
    const line = lines.find(l => l.toLowerCase().includes(kw));
    if (!line) return null;
    const f = line.split(',').map(s => s.replace(/"/g, '').trim());
    if (f.length < 10) return null;
    return {
      name:         f[0],
      reportDate:   f[3] || 'N/A',
      openInterest: parseInt(f[4])  || 0,
      longSpec:     parseInt(f[5])  || 0,
      shortSpec:    parseInt(f[6])  || 0,
      longComm:     parseInt(f[8])  || 0,
      shortComm:    parseInt(f[9])  || 0,
    };
  }

  function net(long, short) {
    const n = long - short;
    return `${n > 0 ? '+' : ''}${n.toLocaleString()} (${n > 0 ? 'NET LONG' : 'NET SHORT'})`;
  }

  try {
    const markets = cotMap[asset];
    if (markets) {
      const cotRes = await fetch("https://www.cftc.gov/dea/newcot/f_leg.txt", {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(12000)
      });
      if (!cotRes.ok) throw new Error(`CFTC HTTP ${cotRes.status}`);
      const cotText = await cotRes.text();
      if (cotText.length < 500) throw new Error("CFTC response too short");

      if (markets.length === 1) {
        const d = parseCOT(cotText, markets[0]);
        if (d) {
          cotContext = `
REAL COT DATA (CFTC Legacy Report — ${d.reportDate})
Market: ${d.name}
Open Interest: ${d.openInterest.toLocaleString()} contracts
Commercial (Smart Money): Long ${d.longComm.toLocaleString()} | Short ${d.shortComm.toLocaleString()} | Net: ${net(d.longComm, d.shortComm)}
Non-Commercial (Speculators): Long ${d.longSpec.toLocaleString()} | Short ${d.shortSpec.toLocaleString()} | Net: ${net(d.longSpec, d.shortSpec)}`;
        } else {
          cotContext = `COT data for ${markets[0]} not found in CFTC report. Provide general institutional analysis.`;
        }
      } else {
        const base  = parseCOT(cotText, markets[0]);
        const quote = parseCOT(cotText, markets[1]);

        if (base && quote) {
          const bcn = base.longComm  - base.shortComm;
          const qcn = quote.longComm - quote.shortComm;
          const bsn = base.longSpec  - base.shortSpec;
          const qsn = quote.longSpec - quote.shortSpec;

          const commBull = bcn > 0 && qcn < 0;
          const commBear = bcn < 0 && qcn > 0;
          const specBull = bsn > 0 && qsn < 0;
          const specBear = bsn < 0 && qsn > 0;

          const commSig = commBull ? "BULLISH CONFLUENCE — commercials long base, short quote"
                        : commBear ? "BEARISH CONFLUENCE — commercials short base, long quote"
                        : "MIXED — no directional confluence";
          const specSig = specBull ? "BULLISH — speculators net long base, net short quote"
                        : specBear ? "BEARISH — speculators net short base, net long quote"
                        : "MIXED — conflicting speculator positioning";
          const div = (commBull && specBear) || (commBear && specBull)
                    ? "⚠ DIVERGENCE: Smart money vs speculators on opposite sides — high probability stop hunt or reversal."
                    : "Smart money and speculators aligned — trend continuation bias.";

          cotContext = `
REAL COT DATA — CROSS PAIR INFERENCE (CFTC Legacy Report — ${base.reportDate})
Cross: ${asset} | Derived from: ${markets[0]} + ${markets[1]}

BASE (${markets[0]}):
  OI: ${base.openInterest.toLocaleString()} | Comm Net: ${net(base.longComm, base.shortComm)} | Spec Net: ${net(base.longSpec, base.shortSpec)}

QUOTE (${markets[1]}):
  OI: ${quote.openInterest.toLocaleString()} | Comm Net: ${net(quote.longComm, quote.shortComm)} | Spec Net: ${net(quote.longSpec, quote.shortSpec)}

CROSS INFERENCE:
  Commercial Signal: ${commSig}
  Speculator Signal: ${specSig}
  ${div}`;
        } else {
          cotContext = `Cross COT inference: ${markets[0]}: ${base ? 'found' : 'missing'}, ${markets[1]}: ${quote ? 'found' : 'missing'}. Provide general institutional analysis.`;
        }
      }
    } else {
      cotContext = `CFTC does not publish COT data for ${asset}. Analyze via cross-market flows.`;
    }
  } catch (err) {
    cotContext = `COT fetch failed (${err.message}). Provide general institutional positioning analysis for ${asset} based on known market dynamics.`;
  }

  // ── 3. GROQ ANALYSIS ─────────────────────────────────────────────────────────

  const today = new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${groqKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 2000,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: `You are a veteran institutional market analyst with 20 years of forex and commodity trading experience. You specialise in Fibonacci retracements, COT positioning, liquidity engineering, and smart money concepts. NOT a financial advisor. Educational market structure analysis only. Write dense, precise institutional prose. CRITICAL: Use ONLY the exact real numbers provided below. Do NOT invent or estimate any price levels or COT figures. Today is ${today}.`
          },
          {
            role: "user",
            content: `Asset: ${asset}
Intelligence Pillar: ${pillar || 'Full Market Briefing'}

${priceContext}

${fibContext}

${cotContext}

Using ONLY the real data above, write a full institutional market structure briefing:
1. FIBONACCI STRUCTURE — cite exact levels, identify which price is reacting to
2. COT POSITIONING — use exact COT numbers, explain smart money vs speculator behaviour
3. LIQUIDITY ENGINEERING — stop cluster locations relative to the Fibonacci levels
4. SMART MONEY CONCEPTS — order blocks, fair value gaps, institutional traps
5. MACRO CONTEXT — macro forces currently driving this asset
6. SHADOW LOGISTICS — shipping, commodity, cross-market flows

600-800 words. End with: FOR EDUCATIONAL PURPOSES ONLY. NOT FINANCIAL ADVICE.`
          }
        ]
      })
    });

    const data = await response.json();
    if (data.choices?.[0]?.message) {
      return res.status(200).json({ result: data.choices[0].message.content });
    }
    return res.status(200).json({ result: "DATA ERROR: " + JSON.stringify(data) });
  } catch (err) {
    return res.status(200).json({ result: "NETWORK ERROR: " + err.message });
  }
};

module.exports = handler;
