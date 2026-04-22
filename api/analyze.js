export default async function handler(req, res) {
  const apiKey = process.env.API_KEY;
  const word = req.body.word || "Market Asset";

  if (!apiKey) {
    return res.status(200).json({ result: "SYSTEM ERROR: API_KEY is missing from Vercel Settings. Add it and redeploy." });
  }

  try {
    // UPDATED TO GEMINI 3 FLASH - V1 API
    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-3-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Provide a professional institutional market scan for: " + word + ". Focus on order flow, liquidity traps, and 2026 volatility metrics." }] }]
      })
    });

    const data = await response.json();
    
    if (data.error) {
      return res.status(200).json({ result: "GOOGLE ERROR: " + data.error.message });
    }

    // Safety check for the 3.0 data format
    if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts) {
        const resultText = data.candidates[0].content.parts[0].text;
        res.status(200).json({ result: resultText });
    } else {
        res.status(200).json({ result: "SYSTEM ERROR: AI response format mismatch. Contact Terminal Admin." });
    }

  } catch (err) {
    res.status(200).json({ result: "CONNECTION ERROR: " + err.message });
  }
}
