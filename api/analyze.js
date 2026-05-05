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

  function net(long, short) {
    const n = long - short;
    return `${n > 0 ? '+' : ''}${n.toLocaleString()} (${n > 0 ? 'NET LONG' : 'NET SHORT'})`;
  }

  // Build URL for most recent CFTC viewable report
  // Format: https://www.cftc.gov/MarketReports/CommitmentsofTraders/HistoricalViewable/cot{MMDDYY}
  function getMostRecentCOTUrl() {
    const now = new Date();
    // COT reports come out Friday, data from prior Tuesday
    // Find last Friday
    const day = now.getDay(); // 0=Sun, 5=Fri
    const daysBack = day >= 5 ? day - 5 : day + 2;
    const friday = new Date(now);
    friday.setDate(now.getDate() - daysBack);
    // If today is before Friday 3:30 PM ET, go back one more week
    const mm = String(friday.getMonth() + 1).padStart(2, '0');
    const dd = String(friday.getDate()).padStart(2, '0');
    const yy = String(friday.getFullYear()).slice(2);
    return `https://www.cftc.gov/MarketReports/CommitmentsofTraders/HistoricalViewable/cot${mm}${dd}${yy}`;
  }

  // Parse the HTML viewable report — it's a preformatted text report
  // Numbers appear as space-padded columns in a fixed-width format
  function parseHTMLReport(html, keyword) {
    // Strip HTML tags to get the text
    const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
    const kw = keyword.toUpperCase();
    const idx = text.toUpperCase().indexOf(kw);
    if (idx === -1) return null;

    // Get the section of text around and after the keyword
    const section = text.slice(idx, idx + 2000);

    // Extract numbers — the report format has:
    // Open Interest, then NonComm Long, Short, Spreading, Comm Long, Short
    // We look for sequences of large numbers (contract counts in thousands)
    const nums = [];
    const numRe = /\b(\d{1,3}(?:,\d{3})+|\d{4,})\b/g;
    let m;
    while ((m = numRe.exec(section)) !== null && nums.length < 15) {
      nums.push(parseInt(m[1].replace(/,/g, '')));
    }

    if (nums.length < 6) return null;

    // Find the report date near the keyword
    const dateMatch = section.match(/(\w+ \d+, \d{4})/);
    const reportDate = dateMatch ? dateMatch[1] : 'N/A';

    return {
      name:         keyword,
      reportDate,
      openInterest: nums[0] || 0,
      longSpec:     nums[1] || 0,
      shortSpec:    nums[2] || 0,
      longComm:     nums[4] || 0,
      shortComm:    nums[5] || 0,
    };
  }

  let _cotHtml = null;
  async function getCOTHtml() {
    if (_cotHtml) return _cotHtml;
    const url = getMostRecentCOTUrl();
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) throw new Error(`CFTC report ${res.status} at ${url}`);
    const html = await res.text();
    if (html.length < 1000) throw new Error("CFTC report too short");
    _cotHtml = html;
    return html;
  }

  async function fetchCOT(keyword) {
    const html = await getCOTHtml();
    return parseHTMLReport(html, keyword);
  }

  function parseCOTCsv(csvText, keyword) {
    const lines = csvText.split('\n');
    const header = lines[0].split(',').map(h => h.replace(/"/g,'').trim().toLowerCase());
    const kw = keyword.toLowerCase();

    // Find all lines matching this keyword, then pick the most recent
    const matching = lines.slice(1).filter(l => l.toLowerCase().includes(kw));
    if (matching.length === 0) return null;

    // Sort by date descending — date is in column 2 (Report_Date_as_YYYY_MM_DD)
    matching.sort((a, b) => {
      const da = a.split(',')[2]?.replace(/"/g,'') || '';
      const db = b.split(',')[2]?.replace(/"/g,'') || '';
      return db.localeCompare(da);
    });

    const f = matching[0].split(',').map(s => s.replace(/"/g,'').trim());

    // Column indices from header:
    // 1=Market_and_Exchange_Names, 2=Report_Date, 10=Open_Interest_All
    // 11=NonComm_Long_All, 12=NonComm_Short_All, 14=Comm_Long_All, 15=Comm_Short_All
    return {
      name:         f[1]  || keyword,
      reportDate:   f[2]  || 'N/A',
      openInterest: parseInt(f[10]) || 0,
      longSpec:     parseInt(f[11]) || 0,
      shortSpec:    parseInt(f[12]) || 0,
      longComm:     parseInt(f[14]) || 0,
      shortComm:    parseInt(f[15]) || 0,
    };
  }

  async function fetchCOT(keyword) {
    const csvText = await getCOTData();
    return parseCOTCsv(csvText, keyword);
  }

  try {
    const markets = cotMap[asset];
    if (markets) {
      if (markets.length === 1) {
        const d = await fetchCOT(markets[0]);
        if (d) {
          cotContext = `
REAL COT DATA (CFTC Legacy Futures Only — ${d.reportDate})
Market: ${d.name}
Open Interest: ${d.openInterest.toLocaleString()} contracts
Commercial (Smart Money): Long ${d.longComm.toLocaleString()} | Short ${d.shortComm.toLocaleString()} | Net: ${net(d.longComm, d.shortComm)}
Non-Commercial (Speculators): Long ${d.longSpec.toLocaleString()} | Short ${d.shortSpec.toLocaleString()} | Net: ${net(d.longSpec, d.shortSpec)}`;
        } else {
          cotContext = `COT data for ${markets[0]} not found in CFTC database. Provide general institutional analysis.`;
        }
      } else {
        // Cross pair — fetch both legs in parallel
        const [base, quote] = await Promise.all([
          fetchCOT(markets[0]),
          fetchCOT(markets[1])
        ]);

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
                        : "MIXED — no clear directional confluence";
          const specSig = specBull ? "BULLISH — speculators net long base, net short quote"
                        : specBear ? "BEARISH — speculators net short base, net long quote"
                        : "MIXED — conflicting speculator positioning";
          const div = (commBull && specBear) || (commBear && specBull)
                    ? "⚠ DIVERGENCE: Smart money vs speculators on opposite sides — high probability stop hunt or reversal setup."
                    : "Smart money and speculators aligned — trend continuation bias.";

          cotContext = `
REAL COT DATA — CROSS PAIR INFERENCE (CFTC Legacy Futures Only — ${base.reportDate})
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
          cotContext = `Cross COT: ${markets[0]}: ${base ? 'found' : 'missing'}, ${markets[1]}: ${quote ? 'found' : 'missing'}. Provide general institutional positioning analysis.`;
        }
      }
    } else {
      cotContext = `CFTC does not publish COT data for ${asset}. Analyze via cross-market flows and price action.`;
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
