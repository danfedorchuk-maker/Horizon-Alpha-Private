const handler = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { pair, timeframe } = req.body;
  const apiKey = process.env.TWELVE_DATA_API_KEY;

  const tfConfig = {
    '5min':  { interval: '5min',  outputsize: 2000, minPips: 10,  windowCandles: 20, bbPips: 10 },
    '15min': { interval: '15min', outputsize: 2000, minPips: 20,  windowCandles: 20, bbPips: 15 },
    '30min': { interval: '30min', outputsize: 2000, minPips: 30,  windowCandles: 20, bbPips: 20 },
    '1h':    { interval: '1h',    outputsize: 2000, minPips: 50,  windowCandles: 20, bbPips: 30 },
    '4h':    { interval: '4h',    outputsize: 2000, minPips: 80,  windowCandles: 20, bbPips: 30 },
  };

  const cfg = tfConfig[timeframe];
  if (!cfg) return res.status(400).json({ error: 'Invalid timeframe' });

  const symbol = encodeURIComponent(pair);
  const isJpy = pair.includes('JPY');
  const pipSize = isJpy ? 0.01 : 0.0001;
  const minMove = cfg.minPips * pipSize;
  const bbTube = cfg.bbPips * pipSize; // 30-pip tube threshold

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
      volume: parseFloat(c.volume) || 0,
    }));

    // ── HELPERS ───────────────────────────────────────────────────────────────

    // Bollinger Bands (20-period, 2 std dev)
    function getBB(candles, idx, period=20) {
      if (idx < period) return null;
      const slice = candles.slice(idx - period, idx);
      const closes = slice.map(c => c.close);
      const mean = closes.reduce((a,b) => a+b, 0) / period;
      const variance = closes.reduce((s,c) => s + Math.pow(c - mean, 2), 0) / period;
      const std = Math.sqrt(variance);
      return { upper: mean + 2*std, lower: mean - 2*std, middle: mean, bandwidth: (4*std) };
    }

    // Candle pattern detection at swing high
    function getReversalPattern(candles, idx) {
      const c = candles[idx];
      const body = Math.abs(c.close - c.open);
      const range = c.high - c.low;
      const upperWick = c.high - Math.max(c.open, c.close);
      const lowerWick = Math.min(c.open, c.close) - c.low;

      if (range === 0) return 'none';

      // Doji: body < 10% of range
      if (body / range < 0.1) return 'doji';

      // Spinning top: body < 30% of range, wicks on both sides
      if (body / range < 0.3 && upperWick > body && lowerWick > body) return 'spinning_top';

      // Shooting star / bearish pin bar at swing high: long upper wick, small body at bottom
      if (upperWick > body * 2 && upperWick > range * 0.5 && lowerWick < body) return 'shooting_star';

      // Evening star: bearish candle after bullish push (check prev candle)
      if (idx > 0) {
        const prev = candles[idx - 1];
        const prevBullish = prev.close > prev.open;
        const curBearish = c.close < c.open;
        if (prevBullish && curBearish && body > range * 0.4) return 'evening_star';
      }

      return 'none';
    }

    // Volume check: is swing high volume below peak volume in the move?
    function isVolumeBelowPeak(candles, swingLowIdx, swingHighIdx) {
      if (swingHighIdx <= swingLowIdx) return false;
      const swingHighVol = candles[swingHighIdx].volume;
      let peakVol = 0;
      for (let i = swingLowIdx; i <= swingHighIdx; i++) {
        if (candles[i].volume > peakVol) peakVol = candles[i].volume;
      }
      return peakVol > 0 && swingHighVol < peakVol * 0.8; // below 80% of peak
    }

    // BB squeeze check: bandwidth < bbTube threshold
    function isBBSqueeze(bb) {
      return bb && bb.bandwidth < bbTube;
    }

    // ── REGIME DETECTION ──────────────────────────────────────────────────────
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
    for (let i = 0; i < regimes.length - 1; i++) {
      matrix[regimes[i]][regimes[i+1]]++;
    }
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
        for (let c = 0; c < 3; c++)
          for (let k = 0; k < 3; k++)
            next[r][c] += mat[r][k] * mat[k][c];
      mat = next;
    }
    const stationary = mat[0];

    // ── FIB BACKTEST ──────────────────────────────────────────────────────────
    const results       = { '38.2': [], '50.0': [], '61.8': [] };
    const resultsFiltered = { '38.2': [], '50.0': [], '61.8': [] };
    const resultsCandle = { '38.2': [], '50.0': [], '61.8': [] };
    const resultsEarly  = { '38.2': [], '50.0': [], '61.8': [] };
    const swingLookback = 5;
    let missedTrades = 0;
    let missedButContinued = 0;
    let totalMissedContinuationPips = 0;
    let totalSwings = 0;
    let reversalCandleCount = 0;
    let volumeBelowPeakCount = 0;
    let bbSqueezeCount = 0;

    for (let i = W + swingLookback * 2; i < candles.length - 20; i++) {
      const windowRegime = regimes[i - W] ?? 2;
      const isGoodRegime = windowRegime === 0;

      let isSwingLow = true;
      for (let j = i - swingLookback; j < i; j++) {
        if (candles[j].low <= candles[i].low) { isSwingLow = false; break; }
      }
      for (let j = i + 1; j <= i + swingLookback; j++) {
        if (candles[j] && candles[j].low <= candles[i].low) { isSwingLow = false; break; }
      }

      if (!isSwingLow) continue;

      const swingLowIdx = i;
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

      totalSwings++;

      // Candle pattern at swing high
      const pattern = getReversalPattern(candles, swingHighIdx);
      const hasReversalCandle = pattern !== 'none';
      if (hasReversalCandle) reversalCandleCount++;

      // Volume at swing high vs peak
      const volBelowPeak = isVolumeBelowPeak(candles, swingLowIdx, swingHighIdx);
      if (volBelowPeak) volumeBelowPeakCount++;

      const fib236 = swingHigh - move * 0.236;
      const fib382 = swingHigh - move * 0.382;

      const target382 = fib236 + (swingHigh - fib236) * 0.382;
      const target500 = fib236 + (swingHigh - fib236) * 0.500;
      const target618 = fib236 + (swingHigh - fib236) * 0.618;

      let reachedEntry = false;

      // ── EARLY ENTRY: BB squeeze only (volume data unreliable on forex) ──
      let earlyEntryIdx = -1;
      let earlyEntryPrice = -1;
      for (let j = swingHighIdx + 1; j < Math.min(swingHighIdx + 20, candles.length); j++) {
        if (candles[j].low <= fib236) break;
        const bb = getBB(candles, j);
        if (isBBSqueeze(bb)) {
          bbSqueezeCount++;
          earlyEntryIdx = j;
          earlyEntryPrice = candles[j].close;
          break;
        }
      }

      // ── STANDARD ENTRY at 23.6% ──
      for (let j = swingHighIdx + 1; j < Math.min(swingHighIdx + 30, candles.length); j++) {
        if (candles[j].low <= fib236 && candles[j].close > fib236) {
          reachedEntry = true;
          const entry = fib236;
          const stop = fib382;
          const targets = { '38.2': target382, '50.0': target500, '61.8': target618 };

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
              const trade = { won, profitPips, time: candles[j].time, swingSize: Math.round(move / pipSize), pattern };
              results[label].push(trade);
              if (isGoodRegime) resultsFiltered[label].push(trade);
              if (hasReversalCandle) resultsCandle[label].push(trade);
            }
          }

          // ── EARLY ENTRY results (same trade outcome, different entry price) ──
          if (earlyEntryIdx !== -1 && earlyEntryPrice > 0) {
            const earlyStop = fib382;
            for (const [label, target] of Object.entries(targets)) {
              let won = false, lost = false;
              for (let k = earlyEntryIdx + 1; k < Math.min(earlyEntryIdx + 50, candles.length); k++) {
                if (candles[k].high >= target) { won = true; break; }
                if (candles[k].low <= earlyStop) { lost = true; break; }
              }
              if (won || lost) {
                const profitPips = won
                  ? Math.round((target - earlyEntryPrice) / pipSize)
                  : Math.round((earlyStop - earlyEntryPrice) / pipSize);
                resultsEarly[label].push({ won, profitPips, time: candles[earlyEntryIdx].time });
              }
            }
          }
          break;
        }
      }

      if (!reachedEntry) {
        missedTrades++;
        // Track what happened after the missed trade — did price continue up?
        let maxContinuation = 0;
        let continuedUp = false;
        for (let j = swingHighIdx + 1; j < Math.min(swingHighIdx + 40, candles.length); j++) {
          const pipsMoved = Math.round((candles[j].high - swingHigh) / pipSize);
          if (pipsMoved > maxContinuation) maxContinuation = pipsMoved;
          if (pipsMoved > cfg.minPips) { continuedUp = true; break; }
          // If it drops below 38.2%, the move failed regardless
          if (candles[j].low <= (swingHigh - move * 0.382)) break;
        }
        if (continuedUp) missedButContinued++;
        totalMissedContinuationPips += maxContinuation;
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

    const summary = {}, summaryFiltered = {}, summaryCandle = {}, summaryEarly = {};
    for (const label of ['38.2','50.0','61.8']) {
      summary[label] = summarize(results[label]);
      summaryFiltered[label] = summarize(resultsFiltered[label]);
      summaryCandle[label] = summarize(resultsCandle[label]);
      summaryEarly[label] = summarize(resultsEarly[label]);
    }

    const missedPct = totalSwings > 0 ? Math.round((missedTrades / totalSwings) * 100) : 0;
    const missedContinuedPct = missedTrades > 0 ? Math.round((missedButContinued / missedTrades) * 100) : 0;
    const avgMissedPips = missedTrades > 0 ? Math.round(totalMissedContinuationPips / missedTrades) : 0;

    return res.status(200).json({
      pair, timeframe,
      summary, summaryFiltered, summaryCandle, summaryEarly,
      candles: candles.length,
      filters: {
        totalSwings,
        missedTrades,
        missedPct,
        missedButContinued,
        missedContinuedPct,
        avgMissedPips,
        reversalCandleCount,
        reversalCandlePct: totalSwings > 0 ? Math.round((reversalCandleCount/totalSwings)*100) : 0,
        volumeBelowPeakCount,
        volumeBelowPeakPct: totalSwings > 0 ? Math.round((volumeBelowPeakCount/totalSwings)*100) : 0,
        bbSqueezeCount,
      },
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
      }
    });

  } catch (err) {
    return res.status(200).json({ error: err.message });
  }
};

module.exports = handler;
