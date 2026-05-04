export default async function handler(req, res) {
  const apiKey = process.env.API_KEY;
  const { word, tradition, lang } = req.body;

  if (!apiKey) {
    return res.status(200).json({ result: "SYSTEM ERROR: API_KEY missing in Vercel." });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `You are a veteran institutional market analyst with 20 years of experience reading smart money flow. You think in Fibonacci retracements, COT positioning, and liquidity engineering. You are NOT a financial advisor and give NO trade signals. This is educational market structure analysis only.

ASSET: ${word}
INTELLIGENCE PILLAR: ${tradition || 'Full Market Briefing'}

Provide a structured institutional analysis covering:

1. **FIBONACCI STRUCTURE** — Key 38.2%, 50%, 61.8% retracement levels based on recent major swing highs/lows. Where is smart money likely defending or attacking?

2. **COT POSITIONING** — What does Commitment of Traders data typically reveal about this asset? Are commercials net long or short historically at this type of level?

3. **LIQUIDITY ENGINEERING** — Where are the stop clusters sitting? Above what recent highs, below what recent lows? Where would institutions hunt liquidity before the real move?

4. **SMART MONEY CONCEPTS** — Order blocks, fair value gaps, breaker blocks relevant to current structure.

5. **MACRO CONTEXT** — Central bank posture, DXY correlation, relevant macro drivers for 2026.

6. **SHADOW LOGISTICS** (if commodity/crypto) — Baltic Dry Index correlation, shipping data, on-chain signals if applicable.

Write in the style of an institutional research desk briefing. Dense, precise, no fluff. Approximately 600 words. End with: "FOR EDUCATIONAL PURPOSES ONLY. NOT FINANCIAL ADVICE."`
            }]
          }],
          generationConfig: {
            maxOutputTokens: 1500,
            temperature: 0.3
          }
        })
      }
    );

    const data = await response.json();

    if (data.error) {
      return res.status(200).json({ result: "GATEWAY ERROR: " + data.error.message });
    }

    if (data.candidates && data.candidates[0].content) {
      const resultText = data.candidates[0].content.parts[0].text;
      res.status(200).json({ result: resultText });
    } else {
      res.status(200).json({ result: "DATA ERROR: Empty response. Try again." });
    }

  } catch (err) {
    res.status(200).json({ result: "NETWORK ERROR: " + err.message });
  }
}
