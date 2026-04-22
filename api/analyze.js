export default async function handler(req, res) {
  const { word, tradition, lang } = req.body;
  const apiKey = process.env.API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "API_KEY is not configured in Vercel." });
  }

  const prompt = `
    AS AN INSTITUTIONAL RESEARCH ANALYST:
    Analyze the following asset: ${word}
    Using this focus: ${tradition}
    Language/Style: ${lang}

    INCLUDE: 
    1. Institutional order flow sentiment.
    2. Shadow Logistics metrics (BDI/Hormuz impact).
    3. Precise 2026 volatility targets.
  `;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    const data = await response.json();
    const resultText = data.candidates[0].content.parts[0].text;
    
    res.status(200).json({ result: resultText });
  } catch (error) {
    res.status(500).json({ error: "Failed to connect to AI engine." });
  }
}
