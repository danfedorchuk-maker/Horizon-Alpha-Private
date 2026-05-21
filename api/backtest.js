const handler = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { pair, timeframe } = req.body;
  const apiKey = process.env.TWELVE_DATA_API_KEY;

  const tfConfig = {
    '5min':  { interval: '5min',  outputsize: 2000, minPips: 10,  windowCandles: 20 },
    '15min': { interval: '15min', outputsize: 2000, minPips: 20,  windowCandles: 20 },
    '30min': { interval: '30min', outputsize: 2000, minPips: 30,  windowCandles: 20 },
    '1h':    { interval: '1h',    outputsize: 2000, minPips: 50,  windowCandles: 20 },
    '4h':    { interval: '4h',    outputsize: 2000, minPips: 80,  windowCandles: 20 },
  };

  const cfg = tfConfig[timeframe];
  if (!cfg) return res.status(400).json({ error: 'Invalid timeframe' });

  const symbol = encodeURIComponent(pair);
  const isJpy = pair.includes('JPY');
  const pipSize = isJpy ? 0.01 : 0.0001;
  const minMove = cfg.minPips * pipSize;

  try {
    const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=${cfg.interval}&outputsize=${cfg.outputsize}&apikey=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.values || data.values.length < 10) {
      return res.status(200).json({ error: 'Insufficient data for ' + pair + '. API response: ' + JSON.stringify(data).slice(0, 200) });
    }

    const candles = data.values.reverse().map(c => ({
      time: c.datetime,
      open: parseFloat(c.open),
      high: parseFloat(c.high),
      low: parseFloat(c.low),
      close: parseFloat(c.close),
    }));

    // ── REGIME DETECTION ──────────────────────────────────────────────────────
    // Classify each 20-candle window as: 0=consolidation, 1=trending, 2=choppy
    function classifyWindow(slice) {
      const highs = slice.map(c => c.high);
      const lows = slice.map(c => c.low);
      const closes = slice.map(c => c.close);
      const rangeTotal = Math.max(...highs) - Math.min(...lows);
      const rangeAvg = slice.reduce((s, c) => s + (c.high - c.low), 0) / slice.length;
      const netMove = Math.abs(closes[closes.length - 1] - closes[0]);
      const ratio = rangeTotal > 0 ? netMove / rangeTotal : 0;
      // Directional ratio: high = trending, low = choppy, medium = consolidating
      if (ratio > 0.55) return 1; // trending
      if (rangeTotal < rangeAvg * 2.5) return 0; // consolidation (tight range)
      return 2; // choppy
    }

    const W = cfg.windowCandles;
    const regimes = [];
    for (let i = W; i < candles.length; i++) {
      regimes.push(classifyWindow(candles.slice(i - W, i)));
    }

    // Build Markov transition matrix [from][to]
    const matrix = [[0,0,0],[0,0,0],[0,0,0]];
    for (let i = 0; i < regimes.length - 1; i++) {
      matrix[regimes[i]][regimes[i+1]]++;
    }
    // Normalize rows to probabilities
    const transProb = matrix.map(row => {
      const sum = row.reduce((a,b) => a+b, 0);
      return sum > 0 ? row.map(v => v/sum) : [0.33,0.33,0.34];
    });

    // Current regime (last window)
    const currentRegime = regimes[regimes.length - 1];
    const regimeNames = ['CONSOLIDATION', 'TRENDING', 'CHOPPY'];
    const nextProbs = transProb[currentRegime];

    // Stationary distribution (square matrix ~8 times)
    let mat = transProb.map(r => [...r]);
    for (let s = 0; s < 8; s++) {
      const next = [[0,0,0],[0,0,0],[0,0,0]];
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 3; c++)
          for (let k = 0; k < 3; k++)
            next[r][c] += mat[r][k] * mat[k][c];
      mat = next;
    }
    const stationary = mat[0];

    // ── FIB BACKTEST ──────────────────────────────────────────────────────────
    const results = { '38.2': [], '50.0': [], '61.8': [] };
    const resultsFiltered = { '38.2': [], '50.0': [], '61.8': [] }; // regime-filtered
    const swingLookback = 5;

    for (let i = W + swingLookback * 2; i < candles.length - 20; i++) {
      const windowRegime = regimes[i - W] ?? 2;
      // Only take trades in consolidation windows for filtered results
      const isGoodRegime = windowRegime === 0;

      let isSwingLow = true;
      for (let j = i - swingLookback; j < i; j++) {
        if (candles[j].low <= candles[i].low) { isSwingLow = false; break; }
      }
      for (let j = i + 1; j <= i + swingLookback; j++) {
        if (candles[j] && candles[j].low <= candles[i].low) { isSwingLow = false; break; }
      }

      if (isSwingLow) {
        const swingLow = candles[i].low;
        let swingHigh = -1, swingHighIdx = -1;
        for (let j = i + swingLookback; j < Math.min(i + 50, candles.length - 10); j++) {
          let isHigh = true;
          for (let k = j - swingLookback; k < j; k++) {
            if (candles[k].high >= candles[j].high) { isHigh = false; break; }
          }
          if (isHigh && candles[j].high > swingHigh) {
            swingHigh = candles[j].high;
            swingHighIdx = j;
          }
        }

        if (swingHighIdx === -1) continue;
        const move = swingHigh - swingLow;
        if (move < minMove) continue;

        const fib236 = swingHigh - move * 0.236;
        const fib382 = swingHigh - move * 0.382;
        const fib500 = swingHigh - move * 0.500;
        const fib618 = swingHigh - move * 0.618;

        for (let j = swingHighIdx + 1; j < Math.min(swingHighIdx + 30, candles.length); j++) {
          if (candles[j].low <= fib236 && candles[j].close > fib236) {
            const entry = fib236;
            const stop = entry - (5 * pipSize);
            const targets = { '38.2': fib382, '50.0': fib500, '61.8': fib618 };

            for (const [label, target] of Object.entries(targets)) {
              let won = false, lost = false;
              for (let k = j + 1; k < Math.min(j + 40, candles.length); k++) {
                if (candles[k].high >= target) { won = true; break; }
                if (candles[k].low <= stop) { lost = true; break; }
              }
              if (won || lost) {
                const profitPips = won
                  ? Math.round((target - entry) / pipSize)
                  : Math.round((stop - entry) / pipSize);
                const trade = { won, profitPips, time: candles[j].time, swingSize: Math.round(move / pipSize) };
                results[label].push(trade);
                if (isGoodRegime) resultsFiltered[label].push(trade);
              }
            }
            break;
          }
        }
      }
    }

    function summarize(trades) {
      if (!trades.length) return { trades: 0 };
      const wins = trades.filter(t => t.won);
      const losses = trades.filter(t => !t.won);
      const totalPips = trades.reduce((s, t) => s + t.profitPips, 0);
      return {
        trades: trades.length,
        wins: wins.length,
        losses: losses.length,
        winRate: Math.round((wins.length / trades.length) * 100),
        totalPips,
        avgPips: Math.round(totalPips / trades.length),
        avgWinPips: wins.length ? Math.round(wins.reduce((s,t)=>s+t.profitPips,0)/wins.length) : 0,
        avgLossPips: losses.length ? Math.round(losses.reduce((s,t)=>s+t.profitPips,0)/losses.length) : 0,
      };
    }

    const summary = {};
    const summaryFiltered = {};
    for (const label of ['38.2','50.0','61.8']) {
      summary[label] = summarize(results[label]);
      summaryFiltered[label] = summarize(resultsFiltered[label]);
    }

    return res.status(200).json({
      pair, timeframe,
      summary, summaryFiltered,
      candles: candles.length,
      regime: {
        current: regimeNames[currentRegime],
        currentIndex: currentRegime,
        nextProbs: {
          consolidation: Math.round(nextProbs[0] * 100),
          trending: Math.round(nextProbs[1] * 100),
          choppy: Math.round(nextProbs[2] * 100),
        },
        stationary: {
          consolidation: Math.round(stationary[0] * 100),
          trending: Math.round(stationary[1] * 100),
          choppy: Math.round(stationary[2] * 100),
        },
        transitionMatrix: transProb.map(r => r.map(v => Math.round(v * 100))),
      }
    });

  } catch (err) {
    return res.status(200).json({ error: err.message });
  }
};

module.exports = handler;
