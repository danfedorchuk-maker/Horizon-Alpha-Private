// api/analyze.js
// Horizon Alpha Private — Market Intelligence Terminal
// Fetches REAL price data from Twelve Data, calculates REAL Fibonacci levels,
// fetches REAL COT data from CFTC, then sends all of it to Groq for analysis.

const handler = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ result: "Method not allowed." });
  }

  const groqKey   = process.env.GROQ_API_KEY;
  const twelveKey = process.env.TWELVE_DATA_API_KEY;

  if (!groqKey)   return res.status(200).json({ result: "SYSTEM ERROR: GROQ_API_KEY missing." });
  if (!twelveKey) return res.status(200).json({ result: "SYSTEM ERROR: TWELVE_DATA_API_KEY missing." });

  const { word: asset, tradition: pillar } = req.body || {};
  if (!asset) return res.status(200).json({ result: "SYSTEM ERROR: No asset specified." });

  // ── 1. FETCH REAL PRICE DATA FROM TWELVE DATA ──────────────────────────────

  let priceContext = "";
  let fibContext   = "";

  try {
    // Map asset names to Twelve Data symbols
    const symbolMap = {
      "AUD/USD": "AUD/USD", "EUR/USD": "EUR/USD", "GBP/USD": "GBP/USD",
      "NZD/USD": "NZD/USD", "USD/CAD": "USD/CAD", "USD/CHF": "USD/CHF",
      "USD/JPY": "USD/JPY", "AUD/CAD": "AUD/CAD", "AUD/CHF": "AUD/CHF",
      "AUD/JPY": "AUD/JPY", "AUD/NZD": "AUD/NZD", "CAD/CHF": "CAD/CHF",
      "CAD/JPY": "CAD/JPY", "CHF/JPY": "CHF/JPY", "EUR/AUD": "EUR/AUD",
      "EUR/CAD": "EUR/CAD", "EUR/CHF": "EUR/CHF", "EUR/GBP": "EUR/GBP",
      "EUR/JPY": "EUR/JPY", "EUR/NZD": "EUR/NZD", "GBP/AUD": "GBP/AUD",
      "GBP/CAD": "GBP/CAD", "GBP/CHF": "GBP/CHF", "GBP/JPY": "GBP/JPY",
      "GBP/NZD": "GBP/NZD", "NZD/CAD": "NZD/CAD", "NZD/CHF": "NZD/CHF",
      "NZD/JPY": "NZD/JPY", "XAU/USD": "XAU/USD", "BTC/USD": "BTC/USD",
      "ETH/USD": "ETH/USD", "WTI CRUDE OIL": "WTI/USD", "COPPER": "COPPER/USD",
      "S&P 500 (SPX)": "SPX", "NASDAQ 100 (NDX)": "NDX", "DOW JONES (DJI)": "DJI",
      "RUSSELL 2000 (RUT)": "RUT", "NIKKEI 225 (NI225)": "NI225",
      "DAX 40 (DAX)": "DAX", "VIX (THE FEAR GAUGE)": "VIX",
      "S&P/TSX COMPOSITE": "TSX"
    };

    const symbol = symbolMap[asset] || asset;

    // Fetch 90 days of daily candles to get proper swing high/low for Fibonacci
    const tdUrl = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=90&apikey=${twelveKey}`;
    const tdRes  = await fetch(tdUrl);
    const tdData = await tdRes.json();

    if (tdData.values && tdData.values.length > 0) {
      const candles = tdData.values; // newest first
      const current = parseFloat(candles[0].close);
      const prices  = candles.map(c => parseFloat(c.close));
      const highs   = candles.map(c => parseFloat(c.high));
      const lows    = candles.map(c => parseFloat(c.low));

      const swingHigh = Math.max(...highs);
      const swingLow  = Math.min(...lows);
      const range     = swingHigh - swingLow;

      // Calculate real Fibonacci retracement levels (from high to low)
      const fib236 = swingHigh - range * 0.236;
      const fib382 = swingHigh - range * 0.382;
      const fib500 = swingHigh - range * 0.500;
      const fib618 = swingHigh - range * 0.618;
      const fib786 = swingHigh - range * 0.786;

      // Recent price action context
      const prev7  = prices.slice(0, 7);
      const high7  = Math.max(...candles.slice(0,7).map(c => parseFloat(c.high)));
      const low7   = Math.min(...candles.slice(0,7).map(c => parseFloat(c.low)));
      const change7 = ((current - prices[6]) / prices[6] * 100).toFixed(2);
      const trend   = current > prices[6] ? "BULLISH" : "BEARISH";

      const dp = current > 10 ? 2 : current > 1 ? 4 : 5;
      const fmt = (n) => n.toFixed(dp);

      priceContext = `
LIVE MARKET DATA (Source: Twelve Data — as of ${candles[0].datetime})
Asset: ${asset} | Symbol: ${symbol}
Current Price: ${fmt(current)}
7-Day High: ${fmt(high7)} | 7-Day Low: ${fmt(low7)}
7-Day Change: ${change7}% | Trend Bias: ${trend}
90-Day Swing High: ${fmt(swingHigh)} | 90-Day Swing Low: ${fmt(swingLow)}
`;

      fibContext = `
REAL FIBONACCI LEVELS (Calculated from 90-day swing high/low — NOT estimated)
Swing High: ${fmt(swingHigh)} | Swing Low: ${fmt(swingLow)}
23.6% Retracement: ${fmt(fib236)}
38.2% Retracement: ${fmt(fib382)}
50.0% Retracement: ${fmt(fib500)}
61.8% Retracement (Golden Ratio): ${fmt(fib618)}
78.6% Retracement: ${fmt(fib786)}
Current Price (${fmt(current)}) is ${current > fib500 ? "ABOVE" : "BELOW"} the 50% level.
Nearest Fib Support: ${current > fib500 ? fmt(fib500) : fmt(fib618)}
Nearest Fib Resistance: ${current > fib500 ? fmt(fib382) : fmt(fib500)}
`;
    } else {
      priceContext = `Note: Live price data unavailable for ${asset} on free tier. Use known price context.`;
      fibContext   = `Note: Fibonacci levels cannot be calculated without live data. Provide general structural analysis.`;
    }
  } catch (err) {
    priceContext = `Note: Price data fetch failed (${err.message}). Provide general analysis.`;
    fibContext   = `Note: Fibonacci levels unavailable. Provide general structural analysis.`;
  }

  // ── 2. FETCH REAL COT DATA FROM CFTC ───────────────────────────────────────

  let cotContext = "";

  try {
    // CFTC publishes COT data as a CSV — we fetch the most recent report
    // Map assets to CFTC market names
    const cotMap = {
      "EUR/USD": "EURO FX",
      "GBP/USD": "BRITISH POUND",
      "USD/JPY": "JAPANESE YEN",
      "USD/CHF": "SWISS FRANC",
      "USD/CAD": "CANADIAN DOLLAR",
      "AUD/USD": "AUSTRALIAN DOLLAR",
      "NZD/USD": "NEW ZEALAND DOLLAR",
      "XAU/USD": "GOLD",
      "WTI CRUDE OIL": "CRUDE OIL",
      "S&P 500 (SPX)": "S&P 500 STOCK INDEX",
      "BTC/USD": "BITCOIN"
    };

    const cotMarket = cotMap[asset];

    if (cotMarket) {
      // CFTC Disaggregated COT report — legacy format, publicly available
      const cotUrl = `https://www.cftc.gov/dea/newcot/f_disagg.txt`;
      const cotRes  = await fetch(cotUrl, { 
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8000)
      });
      const cotText = await cotRes.text();

      // Find the line for our market
      const lines = cotText.split('\n');
      const marketLine = lines.find(l => l.toUpperCase().includes(cotMarket));

      if (marketLine) {
        const fields = marketLine.split(',');
        // COT fields: market, date, open interest, long, short, spreading, long%, short%...
        const reportDate   = fields[2]  || 'N/A';
        const openInterest = fields[7]  || 'N/A';
        const longComm     = fields[8]  || 'N/A';
        const shortComm    = fields[9]  || 'N/A';
        const longSpec     = fields[11] || 'N/A';
        const shortSpec    = fields[12] || 'N/A';

        cotContext = `
REAL COT DATA (Source: CFTC Disaggregated Report — ${reportDate})
Market: ${cotMarket}
Open Interest: ${parseInt(openInterest).toLocaleString()} contracts
Commercial (Smart Money): Long ${parseInt(longComm).toLocaleString()} | Short ${parseInt(shortComm).toLocaleString()}
Non-Commercial (Speculators): Long ${parseInt(longSpec).toLocaleString()} | Short ${parseInt(shortSpec).toLocaleString()}
Commercial Net: ${(parseInt(longComm) - parseInt(shortComm)).toLocaleString()} (${parseInt(longComm) > parseInt(shortComm) ? "NET LONG — bullish bias" : "NET SHORT — bearish bias"})
Speculator Net: ${(parseInt(longSpec) - parseInt(shortSpec)).toLocaleString()} (${parseInt(longSpec) > parseInt(shortSpec) ? "NET LONG" : "NET SHORT"})
`;
      } else {
        cotContext = `COT data for ${asset} not found in current CFTC report. Provide general COT structural analysis based on known market dynamics.`;
      }
    } else {
      cotContext = `COT data not tracked by CFTC for ${asset}. Analyze institutional positioning based on cross-market flows and price action.`;
    }
  } catch (err) {
    cotContext = `COT data fetch failed (${err.message}). Provide general institutional positioning analysis based on known market dynamics.`;
  }

  // ── 3. SEND REAL DATA TO GROQ FOR ANALYSIS ─────────────────────────────────

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 2000,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: `You are a veteran institutional market analyst with 20 years of forex and commodity trading experience. 
You think in Fibonacci retracements, COT positioning, liquidity engineering, and smart money concepts. 
You are NOT a financial advisor and give NO trade signals. This is purely educational market structure analysis.
Write dense, precise institutional research prose.
CRITICAL: You have been given REAL live price data and REAL COT data. Use ONLY these exact numbers in your analysis. 
Do NOT invent or estimate any price levels or positioning data. Every Fibonacci level you cite must come from the data provided.
Today's date is ${today}.`
          },
          {
            role: "user",
            content: `Asset: ${asset}
Intelligence Pillar: ${pillar || 'Full Market Briefing'}

${priceContext}

${fibContext}

${cotContext}

Using ONLY the real data above, provide a full institutional market structure briefing covering:
1. FIBONACCI STRUCTURE — use the exact levels provided above, identify which levels price is reacting to
2. COT POSITIONING — use the exact COT numbers provided, explain what smart money vs speculators are doing
3. LIQUIDITY ENGINEERING — where are the stop clusters relative to the Fibonacci levels above?
4. SMART MONEY CONCEPTS — order blocks, fair value gaps, institutional traps based on the real price data
5. MACRO CONTEXT — current macro forces driving this asset
6. SHADOW LOGISTICS — shipping/commodity/cross-market flows affecting this asset

Write 600-800 words of dense institutional analysis using the real numbers provided.
End with: FOR EDUCATIONAL PURPOSES ONLY. NOT FINANCIAL ADVICE.`
          }
        ]
      })
    });

    const data = await response.json();
    if (data.choices && data.choices[0] && data.choices[0].message) {
      return res.status(200).json({ result: data.choices[0].message.content });
    } else {
      return res.status(200).json({ result: "DATA ERROR: " + JSON.stringify(data) });
    }
  } catch (err) {
    return res.status(200).json({ result: "NETWORK ERROR: " + err.message });
  }
};

module.exports = handler;
