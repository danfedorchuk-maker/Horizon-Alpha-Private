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
      return res.status(200).json({ error: 'Insufficient data for ' + pair });
    }

    const candles = data.values.reverse().map(c => ({
      time: c.datetime,
      open: parseFloat(c.open),
      high: parseFloat(c.high),
      low: parseFloat(c.low),
      close: parseFloat(c.close),
    }));

    // ── REGIME DETECTION ──
    function classifyWindow(slice) {
      const highs = slice.map(c => c.high);
      const lows = slice.map(c => c.low);
      const closes = slice.map(c => c.close);
      const rangeTotal = Math.max(...highs) - Math.min(...lows);
      const rangeAvg = slice.reduce((s, c) => s + (c.high - c.low), 0) / slice.length;
      const netMove = Math.abs(closes[closes.length - 1] - closes[0]);
      const ratio = rangeTotal > 0 ? netMove / rangeTotal : 0;
      if (ratio > 0.55) return 1;
      if (rangeTotal < rangeAvg * 2.5) return 0;
      return 2;
    }

    const W = cfg.windowCandles;
    const regimes = [];
    for (let i = W; i < candles.length; i++) {
      regimes.push(classifyWindow(candles.slice(i - W, i)));
    }

    const matrix = [[0,0,0],[0,0,0],[0,0,0]];
    for (let i = 0; i < regimes.length - 1; i++) matrix[regimes[i]][regimes[i+1]]++;
    const transProb = matrix.map(row => {
      const sum = row.reduce((a,b) => a+b, 0);
      return sum > 0 ? row.map(v => v/sum) : [0.33,0.33,0.34];
    });
    const currentRegime = regimes[regimes.length - 1];
    const regimeNames = ['CONSOLIDATION', 'TRENDING', 'CHOPPY'];
    const nextProbs = transProb[currentRegime];

    let mat = transProb.map(r => [...r]);
    for (let s = 0; s < 8; s++) {
      const next = [[0,0,0],[0,0,0],[0,0,0]];
      for (let r = 0; r < 3; r++)
        for (let c2 = 0; c2 < 3; c2++)
          for (let k = 0; k < 3; k++)
            next[r][c2] += mat[r][k] * mat[k][c2];
      mat = next;
    }
    const stationary = mat[0];

    // ── DANIEL'S RETRACEMENT SYSTEM ──
    // Find completed moves (both up and down)
    // Enter in the DIRECTION of the retracement when price crosses 23.6%
    // Target 38.2% of the move
    // If 38.2% is blown through, ride to 61.8% then flip

    const results382 = [];   // exit at 38.2%
    const results618 = [];   // rode to 61.8% (38.2% blown through)
    const resultsFlip = [];  // flipped at 61.8% back toward origin
    const swingLookback = 5;
    let totalSwings = 0;
    let upSwings = 0;
    let downSwings = 0;

    for (let i = W + swingLookback * 2; i < candles.length - 30; i++) {

      // ── DETECT SWING HIGH (start of down retracement) ──
      let isSwingHigh = true;
      for (let j = i - swingLookback; j < i; j++) {
        if (candles[j].high >= candles[i].high) { isSwingHigh = false; break; }
      }
      for (let j = i + 1; j <= i + swingLookback; j++) {
        if (candles[j] && candles[j].high >= candles[i].high) { isSwingHigh = false; break; }
      }

      if (isSwingHigh) {
        // Find the preceding swing low to measure the up move
        let swingLow = Infinity, swingLowIdx = -1;
        for (let j = i - swingLookback; j > Math.max(i - 60, W); j--) {
          let isLow = true;
          for (let k = j - swingLookback; k < j && k >= 0; k++) {
            if (candles[k].low <= candles[j].low) { isLow = false; break; }
          }
          if (isLow && candles[j].low < swingLow) {
            swingLow = candles[j].low;
            swingLowIdx = j;
            break;
          }
        }
        if (swingLowIdx === -1) continue;

        const move = candles[i].high - swingLow;
        if (move < minMove) continue;

        totalSwings++;
        downSwings++;

        const swingHighPrice = candles[i].high;
        // Fib levels measured DOWN from swing high
        const fib236 = swingHighPrice - move * 0.236; // entry — SHORT here
        const fib382 = swingHighPrice - move * 0.382; // target 1
        const fib618 = swingHighPrice - move * 0.618; // target 2 (if 38.2% blown)
        const stop   = swingHighPrice - move * 0.10;  // stop above entry (10% back up)

        // Look for price crossing 23.6% going DOWN (short entry)
        for (let j = i + 1; j < Math.min(i + 30, candles.length); j++) {
          if (candles[j].high >= fib236 && candles[j].close < fib236) {
            // SHORT entered at fib236
            const entry = fib236;
            const stopPrice = stop;

            let hit382 = false, hit618 = false, stopped = false;
            let idx382 = -1;

            for (let k = j + 1; k < Math.min(j + 50, candles.length); k++) {
              if (!hit382 && candles[k].low <= fib382) { hit382 = true; idx382 = k; }
              if (candles[k].high >= stopPrice) { stopped = true; break; }
              if (hit382 && candles[k].low <= fib618) { hit618 = true; break; }
              if (hit382 && candles[k].high >= fib236) break; // reversed back past entry
            }

            const pipSize_ = pipSize;
            if (stopped && !hit382) {
              // stopped out before hitting 38.2%
              results382.push({ won: false, profitPips: Math.round((stopPrice - entry) / pipSize_), dir: 'short' });
            } else if (hit382) {
              const pips382 = Math.round((entry - fib382) / pipSize_);
              results382.push({ won: true, profitPips: pips382, dir: 'short' });

              if (hit618) {
                const pips618 = Math.round((entry - fib618) / pipSize_);
                results618.push({ won: true, profitPips: pips618, dir: 'short' });
                // Flip: go long at 61.8%, target back to 38.2%
                const flipEntry = fib618;
                const flipTarget = fib382;
                const flipStop = fib618 - (move * 0.1);
                let flipWon = false;
                for (let k = idx382 + 1; k < Math.min(idx382 + 40, candles.length); k++) {
                  if (candles[k].high >= flipTarget) { flipWon = true; break; }
                  if (candles[k].low <= flipStop) break;
                }
                resultsFlip.push({ won: flipWon, profitPips: flipWon ? Math.round((flipTarget - flipEntry) / pipSize_) : Math.round((flipStop - flipEntry) / pipSize_), dir: 'long_flip' });
              }
            }
            break;
          }
        }
      }

      // ── DETECT SWING LOW (start of up retracement) ──
      let isSwingLow = true;
      for (let j = i - swingLookback; j < i; j++) {
        if (candles[j].low <= candles[i].low) { isSwingLow = false; break; }
      }
      for (let j = i + 1; j <= i + swingLookback; j++) {
        if (candles[j] && candles[j].low <= candles[i].low) { isSwingLow = false; break; }
      }

      if (isSwingLow) {
        // Find preceding swing high
        let swingHigh2 = -Infinity, swingHighIdx2 = -1;
        for (let j = i - swingLookback; j > Math.max(i - 60, W); j--) {
          let isHigh = true;
          for (let k = j - swingLookback; k < j && k >= 0; k++) {
            if (candles[k].high >= candles[j].high) { isHigh = false; break; }
          }
          if (isHigh && candles[j].high > swingHigh2) {
            swingHigh2 = candles[j].high;
            swingHighIdx2 = j;
            break;
          }
        }
        if (swingHighIdx2 === -1) continue;

        const move2 = swingHigh2 - candles[i].low;
        if (move2 < minMove) continue;

        totalSwings++;
        upSwings++;

        const swingLowPrice = candles[i].low;
        // Fib levels measured UP from swing low
        const fib236u = swingLowPrice + move2 * 0.236; // entry — LONG here
        const fib382u = swingLowPrice + move2 * 0.382; // target 1
        const fib618u = swingLowPrice + move2 * 0.618; // target 2
        const stopU   = swingLowPrice + move2 * 0.10;  // stop below entry

        // Look for price crossing 23.6% going UP (long entry)
        for (let j = i + 1; j < Math.min(i + 30, candles.length); j++) {
          if (candles[j].low <= fib236u && candles[j].close > fib236u) {
            const entry = fib236u;
            const stopPrice = stopU;

            let hit382 = false, hit618 = false, stopped = false;
            let idx382 = -1;

            for (let k = j + 1; k < Math.min(j + 50, candles.length); k++) {
              if (!hit382 && candles[k].high >= fib382u) { hit382 = true; idx382 = k; }
              if (candles[k].low <= stopPrice) { stopped = true; break; }
              if (hit382 && candles[k].high >= fib618u) { hit618 = true; break; }
              if (hit382 && candles[k].low <= fib236u) break;
            }

            if (stopped && !hit382) {
              results382.push({ won: false, profitPips: Math.round((stopPrice - entry) / pipSize), dir: 'long' });
            } else if (hit382) {
              const pips382 = Math.round((fib382u - entry) / pipSize);
              results382.push({ won: true, profitPips: pips382, dir: 'long' });

              if (hit618) {
                const pips618 = Math.round((fib618u - entry) / pipSize);
                results618.push({ won: true, profitPips: pips618, dir: 'long' });
                const flipEntry = fib618u;
                const flipTarget = fib382u;
                const flipStop = fib618u + (move2 * 0.1);
                let flipWon = false;
                for (let k = idx382 + 1; k < Math.min(idx382 + 40, candles.length); k++) {
                  if (candles[k].low <= flipTarget) { flipWon = true; break; }
                  if (candles[k].high >= flipStop) break;
                }
                resultsFlip.push({ won: flipWon, profitPips: flipWon ? Math.round((flipEntry - flipTarget) / pipSize) : Math.round((flipEntry - flipStop) / pipSize), dir: 'short_flip' });
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
        avgWinPips: wins.length ? Math.round(wins.reduce((s,t)=>s+t.profitPips,0)/wins.length) : 0,
        avgLossPips: losses.length ? Math.round(losses.reduce((s,t)=>s+t.profitPips,0)/losses.length) : 0,
      };
    }

    return res.status(200).json({
      pair, timeframe,
      summary382: summarize(results382),
      summary618: summarize(results618),
      summaryFlip: summarize(resultsFlip),
      candles: candles.length,
      swings: { total: totalSwings, up: upSwings, down: downSwings },
      regime: {
        current: regimeNames[currentRegime],
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
      }
    });

  } catch (err) {
    return res.status(200).json({ error: err.message });
  }
};

module.exports = handler;
